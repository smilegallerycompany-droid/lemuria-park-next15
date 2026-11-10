#!/usr/bin/env python3
"""Pinned CRM display-only release. Run in the owner's authenticated Cloud Shell.

No IAM, database, migration, payment or staff-account changes. Private snapshots
and short-lived credentials stay in Cloud Shell and never enter GitHub/output.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import urlparse
import urllib.request

BASE = 'sha256:9bfcda03f02e25e560256bfa8bdc7870ae43afedc724fca2983cd092a95a3e8b'
REPOSITORY = 'cr.yandex/crprmg5vv1ubl0u4fpad/lemuria-app'
# Cloud Shell home can be a shared FUSE mount that does not honor Unix modes.
# Keep revision snapshots (which may contain secrets) on a private local mount.
WORK = Path(tempfile.gettempdir()) / ('lemuria-cookie-release-20261110-' + str(os.getuid()))
SCRIPTS = Path(__file__).resolve().parent
IDS = {'production': 'bbaqa5r6njb9nrqhaohq', 'staging': 'bba8dkct9jn9885jcd6n'}
ORIGINS = {
    'production': 'https://crm.xn--80ajjjbhwgdz8k.xn--p1ai',
    'staging': 'https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net',
}
FIELDS = ['containerId', 'resources', 'executionTimeout', 'serviceAccountId',
          'concurrency', 'connectivity', 'provisionPolicy', 'secrets', 'logOptions',
          'scalingPolicy', 'storageMounts', 'mounts', 'runtime', 'metadataOptions',
          'asyncInvocationConfig']

def run(args, **kwargs):
    return subprocess.check_output(args, text=True, timeout=kwargs.pop('timeout', 60), **kwargs).strip()

def save(name, obj):
    WORK.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(WORK, 0o700)
    (WORK / name).write_text(json.dumps(obj, indent=2))
    os.chmod(WORK / name, 0o600)

def read(name):
    return json.loads((WORK / name).read_text())

def active(target):
    rows = json.loads(run(['yc', 'serverless', 'container', 'revision', 'list',
                          '--container-id', IDS[target], '--format', 'json-rest']))
    rows = [r for r in rows if r['status'] == 'ACTIVE']
    assert len(rows) == 1, 'Exactly one active revision required'
    return rows[0]

def database_name(row):
    env = row['image'].get('environment', {})
    if env.get('DATABASE_URL'):
        return urlparse(env['DATABASE_URL']).path.strip('/')
    if env.get('DB_NAME'):
        return env['DB_NAME']
    refs = [r for r in row.get('secrets', []) if r.get('environmentVariable') in ['DATABASE_URL', 'DB_NAME']]
    assert len(refs) == 1, 'Cannot prove staging database isolation'
    ref = refs[0]
    args = ['yc', 'lockbox', 'payload', 'get', '--id', ref['id'], '--format', 'json-rest']
    if ref.get('versionId'): args += ['--version-id', ref['versionId']]
    payload = json.loads(run(args))
    value = next(e['textValue'] for e in payload['entries'] if e['key'] == ref['key'])
    return urlparse(value).path.strip('/') if ref['environmentVariable'] == 'DATABASE_URL' else value

def validate_config(row, target):
    env = row['image'].get('environment', {})
    assert env.get('APP_ENV') == target
    assert env.get('RUN_MIGRATE_ON_START', '0') == '0'
    assert env.get('RUN_STAGING_SEED_ON_START', '0') == '0'

def snapshot():
    assert not (WORK / 'production-before.json').exists(), 'Do not overwrite rollback snapshot'
    prod, staging = active('production'), active('staging')
    assert prod['image']['imageDigest'] == BASE, 'Production changed; re-audit required'
    validate_config(prod, 'production'); validate_config(staging, 'staging')
    assert database_name(staging) == 'lemuria_staging', 'Staging-only database required'
    save('production-before.json', prod); save('staging-before.json', staging)
    print(json.dumps({'snapshot': True, 'productionRevision': prod['id'],
                      'baseDigest': BASE, 'stagingDatabase': 'lemuria_staging'}))

def build(commit, reuse=False):
    assert len(commit) == 40 and all(c in '0123456789abcdef' for c in commit)
    assert active('production')['image']['imageDigest'] == BASE
    crane = str(Path.home() / 'lemuria-crm-report-fix-20261104/tools/crane')
    token = run(['yc', 'iam', 'create-token'])
    with tempfile.TemporaryDirectory(prefix='lemuria-registry-') as authdir:
        env = dict(os.environ, DOCKER_CONFIG=authdir)
        auth = subprocess.run([crane, 'auth', 'login', 'cr.yandex', '-u', 'iam', '--password-stdin'],
                              input=token, text=True, capture_output=True, env=env, timeout=30)
        assert auth.returncode == 0, 'Registry authentication failed'
        root = WORK / 'rootfs'
        if reuse:
            assert root.is_dir() and not (root/'app/cookie-overlay-files.json').exists()
            assert not (WORK/'image.json').exists()
        else:
            assert not root.exists(), 'Use explicit build-extracted only after a pre-write patch assertion'
            root.mkdir(mode=0o700)
            proc = subprocess.Popen([crane, 'export', REPOSITORY + '@' + BASE, '-'], stdout=subprocess.PIPE, env=env)
            with tarfile.open(fileobj=proc.stdout, mode='r|') as archive:
                for item in archive:
                    name = item.name.lstrip('./')
                    if name.startswith('app/.next/') or name in ['app/package.json', 'app/release-manifest.json', 'app/public/crm-release.json']:
                        archive.extract(item, path=root, filter='data')
            assert proc.wait() == 0, 'Image extraction failed'
        app = root / 'app'
        result = json.loads(run(['node', str(SCRIPTS / 'build-cookie-overlay.cjs'), str(app), commit], timeout=150))
        assert result['cookieBundle'] == 1
        files = json.loads((app / 'cookie-overlay-files.json').read_text())
        with tarfile.open(WORK / 'overlay.tar', 'w') as archive:
            for file in files:
                relative = file['path']
                assert not relative.startswith('/') and '..' not in Path(relative).parts
                assert relative.startswith('.next/') or relative in ['public/privacy-release.json','public/cookie-consent.js','public/cookies.html']
                archive.add(app / relative, arcname='app/' + relative, recursive=False)
        tag = REPOSITORY + ':' + result['releaseId']
        run([crane, 'append', '-b', REPOSITORY + '@' + BASE, '-f', str(WORK / 'overlay.tar'), '-t', tag], env=env, timeout=180)
        digest = run([crane, 'digest', tag], env=env)
        assert digest.startswith('sha256:') and len(digest) == 71
        release = {'releaseId': result['releaseId'], 'sourceCommit': commit,
                   'digest': digest, 'image': REPOSITORY + '@' + digest, 'build': result}
        save('image.json', release)
        print(json.dumps(release))

def payload(before, target, release=None):
    validate_config(before, target)
    value = {k: copy.deepcopy(before[k]) for k in FIELDS if k in before}
    spec = {k: copy.deepcopy(before['image'][k]) for k in ['command', 'args', 'environment', 'workingDir'] if k in before['image']}
    for key in ['command', 'args']:
        if isinstance(spec.get(key), list): spec[key] = {key: spec[key]}
    spec['imageUrl'] = release['image'] if release else before['image']['imageUrl'].split('@')[0] + '@' + before['image']['imageDigest']
    if release:
        spec.setdefault('environment', {}).update(RELEASE_ID=release['releaseId'], GIT_SHA=release['sourceCommit'])
    value['imageSpec'] = spec
    value['description'] = (release['releaseId'] if release else 'Restore ' + before['id']) + '; Cookie choices and consent-gated analytics; no migrations'
    return value

def deploy(target, rollback=False):
    before, release, current = read(target + '-before.json'), read('image.json'), active(target)
    if rollback:
        assert current['image']['imageDigest'] == release['digest'], 'Unexpected current image'
    else:
        assert current['id'] == before['id'], 'Revision changed; re-audit required'
        if target == 'production':
            assert read('staging-accepted.json')['digest'] == release['digest']
            assert active('staging')['image']['imageDigest'] == release['digest']
    request = payload(before, target, None if rollback else release)
    token = run(['yc', 'iam', 'create-token'])
    req = urllib.request.Request('https://serverless-containers.api.cloud.yandex.net/containers/v1/revisions:deploy',
        method='POST', data=json.dumps(request).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as response: op = json.load(response)
    save(target + ('-rollback' if rollback else '') + '-operation.json', op)
    print(json.dumps({'target': target, 'rollback': rollback, 'operation': op['id']}))

def verify(target):
    release, current = read('image.json'), active(target)
    assert current['image']['imageDigest'] == release['digest']
    origin = ORIGINS[target]
    def get(path):
        with urllib.request.urlopen(origin + path, timeout=30) as r:
            assert r.status == 200
            return r.read()
    live = json.loads(get('/api/health/live'))
    ready = json.loads(get('/api/health/ready'))
    assert live['ok'] and live['sha'] == release['sourceCommit']
    assert ready['ok'] and ready['checks']['database'] == 'ok'
    manifest = json.loads(get('/privacy-release.json'))
    assert manifest['releaseId'] == release['releaseId']
    assert manifest['baseImageDigest'] == BASE
    assets = [f for f in manifest['files'] if f['path'].startswith('.next/static/') and f['path'].endswith(('.js', '.css'))]
    assert assets
    for item in assets:
        body = get('/_next/' + item['path'][len('.next/'):])
        assert hashlib.sha256(body).hexdigest() == item['sha256']
        if b'cashier-extras-step' in body or b'booking-column booking-pick' in body:
            assert 'Перерыв с 13:00 до 13:30 и с 17:00 до 17:30'.encode() in body
        if 'Выданные билеты'.encode() in body:
            assert b'.session.location?.timezone??"Europe/Moscow"' in body
        if '/app/director/finance/page-' in item['path']:
            assert b'LemuriaFinanceUI' in body
    result = {'ok': True, 'target': target, 'digest': release['digest'], 'revision': current['id'],
              'database': 'ok', 'assetsVerified': len(assets), 'releaseId': release['releaseId']}
    save('staging-accepted.json' if target == 'staging' else 'production-verified.json', result)
    print(json.dumps(result))

if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'snapshot': snapshot()
    elif action == 'build': build(sys.argv[2])
    elif action == 'build-extracted': build(sys.argv[2], True)
    elif action in ['deploy-staging', 'deploy-production']: deploy(action.removeprefix('deploy-'))
    elif action in ['verify-staging', 'verify-production']: verify(action.removeprefix('verify-'))
    elif action in ['rollback-staging', 'rollback-production']: deploy(action.removeprefix('rollback-'), True)
    else: raise SystemExit('Unknown action')
