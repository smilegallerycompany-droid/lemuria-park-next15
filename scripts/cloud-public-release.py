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

def snapshot():
    snapshots = {}
    for target in CONTAINERS:
        row = active(target)
        assert 'containerId' in row and 'image' in row, 'REST JSON required'
        assert not (WORK / f'{target}-before.json').exists(), 'Do not overwrite rollback snapshot'
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
    assert stage_env.get('DB_NAME') and stage_env.get('DB_NAME') != prod_env.get('DB_NAME'), 'Database isolation must be explicit'
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

def deploy(target):
    assert target in CONTAINERS
    assert read('snapshot-passed.json')['ok']
    if target == 'production':
        # Explicit staging acceptance is saved only after live browser/API QA.
        acceptance = read('staging-accepted.json')
        assert acceptance['digest'] == read('image.json')['digest']
    before = read(f'{target}-before.json')
    assert active(target)['id'] == before['id'], 'Active revision changed; refusing overwrite'
    release = read('image.json')
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
    elif action == 'deploy': deploy(sys.argv[2])
    elif action == 'status': status(sys.argv[2])
    else: raise SystemExit('Unsupported action')
