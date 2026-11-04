#!/usr/bin/env python3
"""Promote/roll back the pinned CRM report overlay in authenticated Cloud Shell.

No IAM, DNS, database, migration or payment changes. Snapshots contain private
deployment settings and remain in the owner's Cloud Shell, outside GitHub.
"""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

WORK = Path.home() / 'lemuria-crm-report-fix-20261104'
API = 'https://serverless-containers.api.cloud.yandex.net/containers/v1'
CONTAINERS = {'production': 'bbaqa5r6njb9nrqhaohq', 'staging': 'bba8dkct9jn9885jcd6n'}
FIELDS = ['containerId', 'resources', 'executionTimeout', 'serviceAccountId',
          'concurrency', 'connectivity', 'provisionPolicy', 'secrets', 'logOptions',
          'scalingPolicy', 'storageMounts', 'mounts', 'runtime', 'metadataOptions',
          'asyncInvocationConfig']

def read(name):
    return json.loads((WORK / name).read_text())

def save(name, value):
    os.umask(0o077)
    (WORK / name).write_text(json.dumps(value, indent=2))

def run(args):
    return subprocess.check_output(args, text=True, timeout=40).strip()

def active(target):
    rows = json.loads(run(['yc', 'serverless', 'container', 'revision', 'list',
                           '--container-id', CONTAINERS[target], '--format', 'json-rest']))
    rows = [x for x in rows if x['status'] == 'ACTIVE']
    assert len(rows) == 1
    return rows[0]

def accept_staging():
    release = read('image.json')
    fixture = read('rollback-fixture-qa-result.json')
    assert fixture['ok'] and fixture['database'] == 'lemuria_staging'
    assert fixture['rolledBack'] and fixture['committedFixtureOrders'] == 0
    assert active('staging')['image']['imageDigest'] == release['digest']
    origin = 'https://d5d9sorlbdsebnpfr97f.0ly8ed4d.apigw.yandexcloud.net'
    with urllib.request.urlopen(origin + '/api/health/ready', timeout=30) as response:
        health = json.load(response)
    assert health['ok'] and health['checks']['database'] == 'ok'
    with urllib.request.urlopen(origin + '/crm-release.json', timeout=30) as response:
        manifest = json.load(response)
    assert manifest['releaseId'] == release['releaseId']
    save('staging-accepted.json', {'ok': True, 'digest': release['digest'],
                                 'rollbackFixture': fixture, 'databaseHealth': 'ok'})
    print(json.dumps({'stagingAccepted': True, 'digest': release['digest']}))

def payload(before, release=None):
    value = {key: copy.deepcopy(before[key]) for key in FIELDS if key in before}
    value['imageSpec'] = {key: copy.deepcopy(before['image'][key])
                          for key in ['command', 'args', 'environment', 'workingDir']
                          if key in before['image']}
    # Image response objects and request objects use the same command wrappers.
    if isinstance(value['imageSpec'].get('command'), list):
        value['imageSpec']['command'] = {'command': value['imageSpec']['command']}
    if isinstance(value['imageSpec'].get('args'), list):
        value['imageSpec']['args'] = {'args': value['imageSpec']['args']}
    if release:
        value['description'] = release['releaseId'] + '; exclude ONLINE; no migrations'
        value['imageSpec']['imageUrl'] = release['image']
        value['imageSpec']['command'] = {'command': ['/app/container-start.sh']}
        value['imageSpec']['args'] = {'args': []}
        env = value['imageSpec'].setdefault('environment', {})
        env['RELEASE_ID'] = release['releaseId']
        env['GIT_SHA'] = release['sourceCommit']
    else:
        value['description'] = 'Rollback CRM report overlay to ' + before['id']
        value['imageSpec']['imageUrl'] = before['image']['imageUrl'].split('@')[0] + '@' + before['image']['imageDigest']
    env = value['imageSpec'].get('environment', {})
    assert env.get('APP_ENV') == 'production'
    assert env.get('RUN_MIGRATE_ON_START', '0') == '0'
    assert env.get('RUN_STAGING_SEED_ON_START', '0') == '0'
    return value

def deploy(rollback=False):
    before = read('production-before.json')
    release = read('image.json')
    current = active('production')
    if rollback:
        assert current['image']['imageDigest'] == release['digest']
    else:
        assert current['id'] == before['id'], 'Production changed: re-audit required'
        assert read('staging-accepted.json')['digest'] == release['digest']
        qa = read('readonly-qa-production-result.json')
        assert qa['ok'] and qa['database'] == 'lemuria' and qa['offlineScopeVerified']
    value = payload(before, None if rollback else release)
    action = 'production-rollback' if rollback else 'production'
    save(action + '-request.json', value)
    token = run(['yc', 'iam', 'create-token'])
    request = urllib.request.Request(API + '/revisions:deploy', method='POST',
                                    data=json.dumps(value).encode(),
                                    headers={'Authorization': 'Bearer ' + token,
                                             'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        operation = json.load(response)
    save(action + '-operation.json', operation)
    print(json.dumps({'action': action, 'operation': operation['id']}))

def status():
    row = active('production')
    print(json.dumps({'revision': row['id'], 'digest': row['image']['imageDigest'],
                      'releaseId': row['image'].get('environment', {}).get('RELEASE_ID'),
                      'sourceCommit': row['image'].get('environment', {}).get('GIT_SHA')}))

if __name__ == '__main__':
    action = sys.argv[1]
    if action == 'accept-staging':
        accept_staging()
    elif action == 'deploy-production':
        deploy()
    elif action == 'rollback-production':
        deploy(True)
    elif action == 'status':
        status()
    else:
        raise SystemExit('Unsupported action')
