"""Pinned additive invitation release; snapshots and credentials stay in Cloud Shell."""
import copy,importlib.util,json,os,subprocess,sys,tarfile,tempfile,urllib.request
from pathlib import Path
S=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('prior',S/'cloud-finance-safe-release.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
r.BASE='sha256:e526be7e86fc98a81f8546798754986094b29df2186fea80cda8a29398dc0982'
r.WORK=Path('/tmp/lemuria-invite-20261110');r.WORK.mkdir(exist_ok=True,mode=0o700)
def active(cid):
 return next(x for x in json.loads(r.run(['yc','serverless','container','revision','list','--container-id',cid,'--format','json-rest'])) if x['status']=='ACTIVE')
def init():
 assert not (r.WORK/'production-before.json').exists()
 for target in ['production','staging']:
  row=active(r.IDS[target]);r.validate_config(row,target)
  if target=='production':assert row['image']['imageDigest']==r.BASE
  else:assert r.database_name(row)=='lemuria_staging'
  r.save(target+'-before.json',row)
 rows=json.loads(r.run(['yc','serverless','container','list','--format','json-rest']))
 cid=next(x['id'] for x in rows if x['name']=='lemuria-crm-readonly-audit')
 r.save('worker-before.json',active(cid));r.save('worker-id.json',{'id':cid})
 print(json.dumps({'snapshots':True,'stagingIsolated':True,'productionDigest':r.BASE}))
def build(commit):
 assert len(commit)==40 and all(c in '0123456789abcdef' for c in commit)
 assert active(r.IDS['production'])['id']==r.read('production-before.json')['id']
 root=r.WORK/'root/app';f=root/'.next/server/app/api/cashier/check-in/route.js';s=f.read_text()
 marker='async function G(a){let b=a.qrToken.trim();'
 assert s.count(marker)==1 and 'invitation-policy.cjs' not in s
 s=s.replace(marker,marker+'const _inv=await require("/app/invitation-policy.cjs").checkInInvitation(y.z,a);if(_inv)return _inv;')
 f.write_text(s);subprocess.run(['node','--check',str(f)],check=True)
 (root/'invitation-policy.cjs').write_text((S.parent/'src/server/services/invitation-policy.cjs').read_text())
 (root/'invitation-activation-worker.cjs').write_text((S/'invitation-activation-worker.cjs').read_text())
 previous=json.loads((root/'public/crm-release.json').read_text());assert previous['sourceCommit']=='7b110ed4a489c16866f6d35592957446748dfe29'
 release={'releaseId':'printed-invitations-20261110-'+commit[:8],'sourceCommit':commit,'baseImageDigest':r.BASE,'previousRelease':previous['releaseId'],'databaseMigrations':False,'scope':'Authenticated single-use invitations; existing finance, scanner and paid-ticket behavior retained'}
 (root/'public/crm-release.json').write_text(json.dumps(release))
 paths=['.next/server/app/api/cashier/check-in/route.js','invitation-policy.cjs','invitation-activation-worker.cjs','public/crm-release.json']
 with tarfile.open(r.WORK/'overlay.tar','w') as t:
  for p in paths:t.add(root/p,arcname='app/'+p)
 c=str(Path.home()/'lemuria-crm-report-fix-20261104/tools/crane')
 with tempfile.TemporaryDirectory() as a:
  env=dict(os.environ,DOCKER_CONFIG=a)
  q=subprocess.run([c,'auth','login','cr.yandex','-u','iam','--password-stdin'],input=r.run(['yc','iam','create-token']),text=True,capture_output=True,env=env);assert q.returncode==0
  tag=r.REPOSITORY+':'+release['releaseId'];r.run([c,'append','-b',r.REPOSITORY+'@'+r.BASE,'-f',str(r.WORK/'overlay.tar'),'-t',tag],env=env,timeout=180)
  digest=r.run([c,'digest',tag],env=env)
 r.save('image.json',{**release,'digest':digest,'image':r.REPOSITORY+'@'+digest});print(json.dumps({'built':True,'digest':digest,'releaseId':release['releaseId']}))
def deploy(target,rollback=False):
 before=r.read(target+'-before.json');current=active(r.IDS[target]);release=r.read('image.json')
 assert current['image']['imageDigest']==release['digest'] if rollback else current['id']==before['id']
 if target=='production' and not rollback:assert r.read('staging-accepted.json')['digest']==release['digest']
 request=r.payload(before,target,None if rollback else release);request['description']='Restore pre-invitation revision' if rollback else release['releaseId']+'; no migrations'
 send(request,target+('-rollback' if rollback else '')+'-operation.json')
def send(payload,name):
 req=urllib.request.Request('https://serverless-containers.api.cloud.yandex.net/containers/v1/revisions:deploy',method='POST',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+r.run(['yc','iam','create-token']),'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=60) as response:op=json.load(response)
 r.save(name,op);print(json.dumps({'operation':op['id']}))
def verify(target):
 current=active(r.IDS[target]);release=r.read('image.json');assert current['image']['imageDigest']==release['digest']
 origin=r.ORIGINS[target]
 for p in ['/api/health/live','/api/health/ready','/crm-release.json']:
  with urllib.request.urlopen(origin+p,timeout=45) as response:j=json.load(response)
  if p.endswith('live'):assert j['sha']==release['sourceCommit']
  elif p.endswith('ready'):assert j['checks']['database']=='ok'
  else:assert j['releaseId']==release['releaseId']
 result={'ok':True,'target':target,'digest':release['digest'],'revision':current['id']}
 if target=='staging':
  assert r.read('stage-test-result.json')['ok'];r.save('staging-accepted.json',result)
 else:r.save('production-verified.json',result)
 print(json.dumps(result))
def worker(mode):
 cid=r.read('worker-id.json')['id'];before=r.read('worker-before.json')
 if mode=='restore':
  b=before;img={k:copy.deepcopy(b['image'][k]) for k in ['command','args','environment','workingDir'] if k in b['image']};img['imageUrl']=b['image']['imageUrl'].split('@')[0]+'@'+b['image']['imageDigest']
 else:
  b=r.read(mode+'-before.json');assert active(r.IDS[mode])['image']['imageDigest']==r.read('image.json')['digest']
  img={k:copy.deepcopy(b['image'][k]) for k in ['environment','workingDir'] if k in b['image']};img.update(imageUrl=r.read('image.json')['image'],command=['node'],args=['/app/invitation-activation-worker.cjs'])
 for k in ['command','args']:
  if isinstance(img.get(k),list):img[k]={k:img[k]}
 payload={k:copy.deepcopy(b[k]) for k in r.FIELDS if k in b};payload.update(containerId=cid,imageSpec=img,description='Private invitation activation '+mode,executionTimeout='300s')
 send(payload,'worker-'+mode+'-operation.json')
def call(action):
 mode='staging' if action=='stage' else 'production';cid=r.read('worker-id.json')['id'];row=active(cid)
 assert row['image']['imageDigest']==r.read('image.json')['digest'];assert row['image']['environment']['APP_ENV']==mode
 if mode=='production':assert r.read('production-verified.json')['ok']
 req=urllib.request.Request('https://'+cid+'.containers.yandexcloud.net/'+action,method='POST',data=b'{}',headers={'Authorization':'Bearer '+r.run(['yc','iam','create-token']),'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=240) as response:result=json.load(response)
 r.save('stage-test-result.json' if action=='stage' else 'issue-result.json',result);print(json.dumps(result))
if __name__=='__main__':
 a=sys.argv[1]
 if a=='init':init()
 elif a=='build':build(sys.argv[2])
 elif a.startswith('deploy-'):deploy(a[7:])
 elif a.startswith('rollback-'):deploy(a[9:],True)
 elif a.startswith('verify-'):verify(a[7:])
 elif a.startswith('worker-'):worker(a[7:])
 elif a in ['stage','issue']:call(a)
 elif a=='check-restored':
  assert active(r.read('worker-id.json')['id'])['image']['imageDigest']==r.read('worker-before.json')['image']['imageDigest'];print('{"restored":true}')
 else:raise SystemExit('Unknown action')
