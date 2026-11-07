#!/usr/bin/env python3
"""Temporary worker on the EXISTING private IAM-only audit container.

Preserves its IAM policy and restores its prior revision configuration afterwards.
All DB fixtures are staging-only and roll back. Production removal is limited to
the three shifts explicitly identified as test data by the owner, with atomic
restorable snapshots in AuditLog. No payment-provider calls.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

SCRIPTS=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',SCRIPTS/'cloud-crm-completion-release.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

def container():
    rows=json.loads(r.run(['yc','serverless','container','list','--format','json-rest']))
    q=[x for x in rows if x['name']=='lemuria-crm-readonly-audit'];assert len(q)==1
    return q[0]['id']

def current():
    rows=json.loads(r.run(['yc','serverless','container','revision','list','--container-id',container(),'--format','json-rest']))
    rows=[x for x in rows if x['status']=='ACTIVE'];assert len(rows)==1;return rows[0]

def build(commit):
    assert not (r.WORK/'maintenance-before.json').exists()
    r.save('maintenance-before.json',current())
    image=r.read('image.json')
    fixture=(SCRIPTS/'crm-report-readonly-qa-worker.cjs').read_text()
    marker='http.createServer(async(req,res)=>{'
    assert fixture.count(marker)==1
    fixture=fixture.replace(marker,"module.exports={check,fixtureCheck};\nif(require.main===module)http.createServer(async(req,res)=>{")
    stage=r.WORK/'maintenance-layer/app';stage.mkdir(parents=True)
    (stage/'crm-finance-fixture.cjs').write_text(fixture)
    for name in ['crm-completion-maintenance-worker.cjs','check-live-staff-policy.cjs']:
        (stage/name).write_text((SCRIPTS/name).read_text())
    for f in stage.glob('*.cjs'):subprocess.run(['node','--check',str(f)],check=True,capture_output=True)
    with tarfile.open(r.WORK/'maintenance.tar','w') as archive:
        for f in stage.iterdir():archive.add(f,arcname='app/'+f.name)
    crane=str(Path.home()/'lemuria-crm-report-fix-20261104/tools/crane')
    with tempfile.TemporaryDirectory(prefix='lemuria-maintenance-auth-') as authdir:
        env=dict(os.environ,DOCKER_CONFIG=authdir)
        auth=subprocess.run([crane,'auth','login','cr.yandex','-u','iam','--password-stdin'],input=r.run(['yc','iam','create-token']),text=True,capture_output=True,env=env);assert auth.returncode==0
        tag=r.REPOSITORY+':crm-completion-qa-'+commit[:8]
        r.run([crane,'append','-b',image['image'],'-f',str(r.WORK/'maintenance.tar'),'-t',tag],env=env,timeout=180)
        digest=r.run([crane,'digest',tag],env=env)
    r.save('maintenance-image.json',{'image':r.REPOSITORY+'@'+digest,'digest':digest})
    print(json.dumps({'built':True,'privateContainer':container(),'digest':digest}))

def deploy(target):
    q=r.read('maintenance-image.json')
    if target=='restore':
        b=r.read('maintenance-before.json')
        payload={k:copy.deepcopy(b[k]) for k in r.FIELDS if k in b}
        img={k:copy.deepcopy(b['image'][k]) for k in ['command','args','environment','workingDir'] if k in b['image']}
        img['imageUrl']=b['image']['imageUrl'].split('@')[0]+'@'+b['image']['imageDigest']
    else:
        assert target in ['staging','production']
        b=r.read(target+'-before.json')
        if target=='staging':assert r.database_name(b)=='lemuria_staging'
        payload={k:copy.deepcopy(b[k]) for k in r.FIELDS if k in b}
        payload['containerId']=container()
        img={'imageUrl':q['image'],'workingDir':'/app','command':['node'],'args':['/app/crm-completion-maintenance-worker.cjs'],'environment':copy.deepcopy(b['image'].get('environment',{}))}
        img['environment'].update(QA_EXPECTED_DB='lemuria_staging' if target=='staging' else 'lemuria',QA_ALLOW_ROLLBACK_FIXTURES='1' if target=='staging' else '0',QA_CHECK_ADMIN='1',QA_ALLOW_TEST_SHIFT_DELETE='1' if target=='production' else '0',RUN_MIGRATE_ON_START='0',RUN_STAGING_SEED_ON_START='0')
        payload['executionTimeout']='120s'
    for key in ['command','args']:
        if isinstance(img.get(key),list):img[key]={key:img[key]}
    payload['imageSpec']=img
    payload['description']='Private CRM verification '+target+'; no IAM changes'
    token=r.run(['yc','iam','create-token'])
    req=urllib.request.Request('https://serverless-containers.api.cloud.yandex.net/containers/v1/revisions:deploy',data=json.dumps(payload).encode(),method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=60) as response:op=json.load(response)
    r.save('maintenance-'+target+'-operation.json',op)
    print(json.dumps({'target':target,'operation':op['id']}))

def call(action):
    cfg=r.read('maintenance-image.json');assert current()['image']['imageDigest']==cfg['digest']
    paths={'readiness':('GET','/readiness'),'fixtures':('POST','/fixtures'),'policy':('GET','/policy'),'scope-qa':('GET','/scope-qa'),'remove-test-shifts':('POST','/remove-test-shifts'),'restore-test-shifts':('POST','/restore-test-shifts')}
    method,path=paths[action];data={}
    if action=='remove-test-shifts':data={'planHash':r.read('maintenance-readiness.json')['planHash']}
    if action=='restore-test-shifts':data={'auditId':r.read('maintenance-remove-test-shifts.json')['backupAuditId']}
    req=urllib.request.Request('https://'+container()+'.containers.yandexcloud.net'+path,method=method,data=json.dumps(data).encode() if method=='POST' else None,headers={'Authorization':'Bearer '+r.run(['yc','iam','create-token']),'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=120) as response:result=json.load(response)
    except urllib.error.HTTPError as error:
        print(json.dumps({'action':action,'status':error.code,'error':json.loads(error.read())}));raise SystemExit(1)
    assert result['ok'];r.save('maintenance-'+action+'.json',result)
    print(json.dumps({k:v for k,v in result.items() if k!='archive'}))

if __name__=='__main__':
    action=sys.argv[1]
    if action=='build':build(sys.argv[2])
    elif action.startswith('deploy-'):deploy(action.removeprefix('deploy-'))
    else:call(action)
