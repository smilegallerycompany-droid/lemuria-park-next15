#!/usr/bin/env python3
"""Snapshot, package and promote a public-only overlay in Yandex Cloud.

Run in the already authenticated Cloud Shell. Credentials stay in subprocess
memory and HTTP headers; no credentials are printed or added to the image.
No IAM, Gateway, DNS, database, migrations, seed or billing changes are made.
"""
import copy
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import urllib.request
from urllib.parse import urlparse

WORK = Path('/tmp/lemuria-release')
APP = WORK / 'rootfs/app'
CRANE = '/tmp/lemuria-tools/crane'
REPO = 'cr.yandex/crprmg5vv1ubl0u4fpad/lemuria-app'
BASE = 'sha256:864ec15ed7cff7a28df1a45a9f6e1c404bad992fb58e234c1fc235280bb864f1'
CONTAINERS = {'staging': 'bba8dkct9jn9885jcd6n', 'production': 'bbaqa5r6njb9nrqhaohq'}
API = 'https://serverless-containers.api.cloud.yandex.net/containers/v1'

def run(args):
    return subprocess.check_output(args, text=True).strip()

def save(name, data):
    target = WORK / name
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream, indent=2)

def active(target):
    rows = json.loads(run(['yc', 'serverless', 'container', 'revision', 'list',
                           '--container-id', CONTAINERS[target], '--format', 'json-rest']))
    rows = [row for row in rows if row['status'] == 'ACTIVE']
    assert len(rows) == 1, 'Expected one active revision'
    return rows[0]

def read(name):
    return json.loads((WORK / name).read_text())

def database_identity(row):
    env = row['image'].get('environment', {})
    if env.get('DB_NAME') and env.get('DB_HOST'):
        return {'name': env['DB_NAME'], 'host': env['DB_HOST']}
    url = env.get('DATABASE_URL')
    if not url:
        refs = [item for item in row.get('secrets', []) if item.get('environmentVariable') == 'DATABASE_URL']
        assert len(refs) == 1, 'A single database connection source is required'
        ref = refs[0]
        args = ['yc', 'lockbox', 'payload', 'get', '--id', ref['id'], '--format', 'json-rest']
        if ref.get('versionId'):
            args.extend(['--version-id', ref['versionId']])
        payload = json.loads(run(args))
        matches = [entry for entry in payload['entries'] if entry['key'] == ref['key']]
        assert len(matches) == 1
        url = matches[0].get('textValue', matches[0].get('text_value'))
    parsed = urlparse(url)
    assert parsed.scheme in ['postgres', 'postgresql'] and parsed.hostname
    return {'name': parsed.path.lstrip('/'), 'host': parsed.hostname}

def snapshot():
    snapshots = {}
    for target in CONTAINERS:
        row = active(target)
        assert 'containerId' in row and 'image' in row, 'REST JSON required'
        if (WORK / f'{target}-before.json').exists():
            assert read(f'{target}-before.json')['id'] == row['id'], 'Never overwrite a different rollback snapshot'
        else:
            save(f'{target}-before.json', row)
        env = row['image'].get('environment', {})
        snapshots[target] = row
        print(json.dumps({'target': target, 'revision': row['id'],
                          'imageDigest': row['image'].get('imageDigest'),
                          'resources': row.get('resources'),
                          'APP_ENV': env.get('APP_ENV'), 'DB_NAME': env.get('DB_NAME'),
                          'DB_HOST': env.get('DB_HOST'),
                          'secrets': len(row.get('secrets', [])),
                          'keys': sorted(row.keys())}))
    assert snapshots['production']['id'] == 'bba22mg3efqv7u8jrr5b', 'Production changed; re-audit required'
    prod_env = snapshots['production']['image'].get('environment', {})
    stage_env = snapshots['staging']['image'].get('environment', {})
    assert stage_env.get('APP_ENV') == 'staging', 'Staging must be marked staging'
    identities = {target: database_identity(row) for target, row in snapshots.items()}
    print(json.dumps({'databaseIdentities': identities}))
    assert identities['staging'] != identities['production'], 'Staging must not connect to production database'
    assert identities['staging']['name'] == 'lemuria_staging', 'Unexpected staging database'
    assert identities['production']['name'] == 'lemuria', 'Unexpected production database'
    assert stage_env.get('RUN_MIGRATE_ON_START', '0') == '0'
    assert stage_env.get('RUN_STAGING_SEED_ON_START', '0') == '0'
    save('snapshot-passed.json', {'ok': True})

def package():
    assert read('snapshot-passed.json')['ok']
    manifest = json.loads((APP / 'public/public-release.json').read_text())
    rows = json.loads((APP / 'overlay-files.json').read_text())
    with tarfile.open(WORK / 'public-overlay.tar', 'w') as archive:
        for row in rows:
            name = row['path']
            assert name.startswith('.next/') or name == 'public/public-release.json'
            assert '..' not in Path(name).parts
            filename = APP / name
            info = archive.gettarinfo(str(filename), arcname='app/' + name)
            info.uid = info.gid = 1000
            info.uname = info.gname = 'nextjs'
            info.mode = 0o644
            with filename.open('rb') as stream:
                archive.addfile(info, stream)
    tag = REPO + ':' + manifest['releaseId']
    subprocess.check_call([CRANE, 'append', '--base', REPO + '@' + BASE,
                           '--new_layer', str(WORK / 'public-overlay.tar'), '--new_tag', tag])
    image_digest = run([CRANE, 'digest', tag])
    assert re.fullmatch(r'sha256:[a-f0-9]{64}', image_digest)
    release = {'releaseId': manifest['releaseId'], 'sourceCommit': manifest['sourceCommit'],
               'image': REPO + '@' + image_digest, 'digest': image_digest,
               'baseDigest': BASE}
    save('image.json', release)
    print(json.dumps(release))

def request(method, url, data=None):
    token = run(['yc', 'iam', 'create-token'])
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method=method,
                                 headers={'Authorization': 'Bearer ' + token,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)

def deploy(target, map_fixture=False):
    assert target in CONTAINERS
    assert read('snapshot-passed.json')['ok']
    if target == 'production':
        # Explicit staging acceptance is saved only after live browser/API QA.
        acceptance = read('staging-accepted.json')
        assert acceptance['digest'] == read('image.json')['digest']
    before = read(f'{target}-before.json')
    release = read('image.json')
    current = active(target)
    assert current['id'] == before['id'] or (target == 'staging' and current['image'].get('imageDigest') == release['digest']), 'Active revision changed; refusing overwrite'
    allowed = ['containerId', 'resources', 'executionTimeout', 'serviceAccountId',
               'concurrency', 'connectivity', 'provisionPolicy', 'secrets', 'logOptions',
               'scalingPolicy', 'storageMounts', 'mounts', 'runtime',
               'metadataOptions', 'asyncInvocationConfig']
    payload = {key: copy.deepcopy(before[key]) for key in allowed if key in before}
    payload['description'] = release['releaseId'] + '; public-only overlay of 20261019; no migrations; PR #1 ' + release['sourceCommit'][:8]
    payload['imageSpec'] = {key: copy.deepcopy(before['image'][key])
                            for key in ['command', 'args', 'environment', 'workingDir']
                            if key in before['image']}
    payload['imageSpec']['imageUrl'] = release['image']
    env = payload['imageSpec'].setdefault('environment', {})
    env['RELEASE_ID'] = release['releaseId']
    env['GIT_SHA'] = release['sourceCommit']
    assert env.get('APP_ENV') == target
    assert env.get('RUN_MIGRATE_ON_START', '0') == '0'
    assert env.get('RUN_STAGING_SEED_ON_START', '0') == '0'
    assert not map_fixture or target == 'staging'
    # Run the SQL probe inside the existing workload's private network, using
    # its existing DB credentials. No new IAM grants or public DB access.
    probe = r'''
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const {spawn}=require('node:child_process');
const env=process.env;
const url=env.DATABASE_URL||('postgresql://'+encodeURIComponent(env.DB_USER)+':'+encodeURIComponent(env.DB_PASSWORD)+'@'+env.DB_HOST+':'+(env.DB_PORT||'6432')+'/'+env.DB_NAME+'?sslmode=require&connection_limit=1&connect_timeout=5');
const p=new PrismaClient({datasources:{db:{url}},log:[]});
(async()=>{
 try{
  const [{database}]=await p.$queryRawUnsafe('SELECT current_database() AS database');
  if(database!==(env.APP_ENV==='production'?'lemuria':'lemuria_staging'))throw new Error('DATABASE_IDENTITY');
  if(MAP_FIXTURE){
   if(database!=='lemuria_staging')throw new Error('STAGING_ONLY');
   const before=await p.location.findUniqueOrThrow({where:{slug:'saratov'},select:{latitude:true,longitude:true,mapUrl:true}});
   if(before.latitude==null&&before.longitude==null){
    console.log('PUBLIC_RELEASE_STAGING_MAP_BEFORE '+JSON.stringify(before));
    await p.location.update({where:{slug:'saratov'},data:{latitude:51.62132,longitude:45.972246,mapUrl:'https://yandex.ru/maps/-/CXfwJNLa'}});
   }
  }
  const audit=await p.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
   const identity=await tx.$queryRawUnsafe("SELECT current_database() AS database, current_setting('server_version') AS version");
   const locations=await tx.location.findMany({where:{status:{in:['ACTIVE','UPCOMING']}},select:{slug:true,latitude:true,longitude:true,timezone:true}});
   const sessions=await tx.$queryRawUnsafe(`SELECT l.slug,COUNT(*)::int AS future_sessions,COUNT(*) FILTER(WHERE (s."startsAt" AT TIME ZONE l.timezone)::time > '14:00'::time)::int AS after_14,MIN(s."startsAt") AS first_session,MAX(s."startsAt") AS last_session FROM "Session" s JOIN "Location" l ON l.id=s."locationId" WHERE s."startsAt">now() AND s.status IN('SCHEDULED','OPEN') GROUP BY l.slug ORDER BY l.slug`);
   return {identity,locations,sessions};
  },{timeout:10000});
  console.log('PUBLIC_RELEASE_DB_AUDIT '+JSON.stringify(audit));
 }catch(e){console.error('PUBLIC_RELEASE_DB_AUDIT_FAILED',e.code||e.errorCode||e.name)}
 finally{await p.$disconnect()}
 const child=spawn('/app/container-start.sh',[],{stdio:'inherit',env});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
 child.on('exit',(code)=>process.exit(code||0));
})();
'''.replace('MAP_FIXTURE', 'true' if map_fixture else 'false')
    payload['imageSpec']['command'] = {'command': ['node', '-e', probe]}
    payload['imageSpec']['args'] = {'args': []}
    save(f'{target}-request.json', payload)
    operation = request('POST', API + '/revisions:deploy', payload)
    save(f'{target}-operation.json', operation)
    print(json.dumps({'target': target, 'operation': operation['id'],
                      'done': operation.get('done'), 'digest': release['digest']}))

def status(target):
    operation = read(f'{target}-operation.json')
    response = json.loads(run(['yc', 'operation', 'get', operation['id'], '--format', 'json-rest']))
    save(f'{target}-operation.json', response)
    if response.get('error'):
        raise RuntimeError(json.dumps(response['error']))
    row = active(target)
    print(json.dumps({'target': target, 'done': response.get('done'), 'revision': row['id'],
                      'imageDigest': row['image'].get('imageDigest'), 'description': row.get('description')}))

if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'snapshot': snapshot()
    elif action == 'package': package()
    elif action == 'deploy': deploy(sys.argv[2], len(sys.argv)>3 and sys.argv[3]=='map-fixture')
    elif action == 'status': status(sys.argv[2])
    else: raise SystemExit('Unsupported action')
