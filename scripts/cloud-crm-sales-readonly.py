#!/usr/bin/env python3
"""Read-only production sales diagnostics on an existing IAM-private worker, restored afterwards."""
import copy,importlib.util,json,os,subprocess,sys,tarfile,tempfile,urllib.request,urllib.error
from pathlib import Path
S=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',S/'cloud-crm-completion-release.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
r.WORK=Path('/tmp')/('lemuria-sales-readonly-20261107-'+str(os.getuid()))
def active(cid):
 rows=json.loads(r.run(['yc','serverless','container','revision','list','--container-id',cid,'--format','json-rest']));return next(x for x in rows if x['status']=='ACTIVE')
def build(commit,reuse=False):
 assert reuse or not (r.WORK/'audit-before.json').exists()
 rows=json.loads(r.run(['yc','serverless','container','list','--format','json-rest']));cid=next(x['id'] for x in rows if x['name']=='lemuria-crm-readonly-audit')
 stage=active(r.IDS['production']);assert r.database_name(stage)=='lemuria';r.validate_config(stage,'production')
 if reuse:assert r.read('stage-before.json')['id']==stage['id'];assert r.read('container.json')['id']==cid
 else:r.save('stage-before.json',stage);r.save('audit-before.json',active(cid));r.save('container.json',{'id':cid})
 layer=r.WORK/'layer/app';layer.mkdir(parents=True,exist_ok=True);(layer/'crm-sales-readonly-worker.cjs').write_text((S/'crm-sales-readonly-worker.cjs').read_text());subprocess.run(['node','--check',str(layer/'crm-sales-readonly-worker.cjs')],check=True)
 with tarfile.open(r.WORK/'layer.tar','w') as t:t.add(layer/'crm-sales-readonly-worker.cjs',arcname='app/crm-sales-readonly-worker.cjs')
 crane=str(Path.home()/'lemuria-crm-report-fix-20261104/tools/crane')
 with tempfile.TemporaryDirectory() as ad:
  env=dict(os.environ,DOCKER_CONFIG=ad);q=subprocess.run([crane,'auth','login','cr.yandex','-u','iam','--password-stdin'],input=r.run(['yc','iam','create-token']),text=True,capture_output=True,env=env);assert q.returncode==0
  base=r.REPOSITORY+'@'+stage['image']['imageDigest'];tag=r.REPOSITORY+':crm-sales-readonly-'+commit[:8]
  r.run([crane,'append','-b',base,'-f',str(r.WORK/'layer.tar'),'-t',tag],env=env,timeout=180)
  digest=r.run([crane,'digest',tag],env=env);r.save('qa-image.json',{'digest':digest,'image':r.REPOSITORY+'@'+digest})
 print(json.dumps({'built':True,'readOnly':True,'digest':digest}))
def deploy(restore=False):
 cid=r.read('container.json')['id'];b=r.read('audit-before.json' if restore else 'stage-before.json');p={k:copy.deepcopy(b[k]) for k in r.FIELDS if k in b};p['containerId']=cid
 if restore:
  img={k:copy.deepcopy(b['image'][k]) for k in ['command','args','environment','workingDir'] if k in b['image']};img['imageUrl']=b['image']['imageUrl'].split('@')[0]+'@'+b['image']['imageDigest']
 else:
  assert r.database_name(b)=='lemuria';img={'imageUrl':r.read('qa-image.json')['image'],'command':['node'],'args':['/app/crm-sales-readonly-worker.cjs'],'workingDir':'/app','environment':copy.deepcopy(b['image'].get('environment',{}))};img['environment'].update(RUN_MIGRATE_ON_START='0',RUN_STAGING_SEED_ON_START='0');p['executionTimeout']='600s'
 for k in ['command','args']:
  if isinstance(img.get(k),list):img[k]={k:img[k]}
 p['imageSpec']=img;p['description']='Private read-only production sales diagnostics' if not restore else 'Restore private worker after read-only sales diagnostics'
 req=urllib.request.Request('https://serverless-containers.api.cloud.yandex.net/containers/v1/revisions:deploy',data=json.dumps(p).encode(),headers={'Authorization':'Bearer '+r.run(['yc','iam','create-token']),'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,timeout=60) as response:op=json.load(response)
 r.save('restore-operation.json' if restore else 'deploy-operation.json',op);print(json.dumps({'operation':op['id'],'restore':restore}))
def call(action):
 assert action=='audit'
 cid=r.read('container.json')['id'];assert active(cid)['image']['imageDigest']==r.read('qa-image.json')['digest']
 req=urllib.request.Request('https://'+cid+'.containers.yandexcloud.net/'+action,method='POST' if action=='test' else 'GET',data=b'{}' if action=='test' else None,headers={'Authorization':'Bearer '+r.run(['yc','iam','create-token']),'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=580) as response:result=json.load(response)
 except urllib.error.HTTPError as e:result=json.loads(e.read())
 r.save(action+'-result.json',result);print(json.dumps({k:result.get(k) for k in ['ok','error','code','date','timezone','today','allCashier','shifts','audits','models']}))
if __name__=='__main__':
 a=sys.argv[1]
 if a=='build':build(sys.argv[2])
 elif a=='rebuild':build(sys.argv[2],True)
 elif a=='deploy':deploy()
 elif a=='restore':deploy(True)
 elif a=='verify-restored':
  assert active(r.read('container.json')['id'])['image']['imageDigest']==r.read('audit-before.json')['image']['imageDigest'];print('{"restored":true}')
 else:call(a)
