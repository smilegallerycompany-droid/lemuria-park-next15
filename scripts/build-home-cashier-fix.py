"""Build a minimal layer from the Nov 20 production image, retaining previous asset URLs."""
import hashlib
import json
import re
import subprocess
import sys
import tarfile
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1]).resolve()
layer = Path(sys.argv[2]).resolve()
source = Path(__file__).resolve().parent
changed = {}
def digest(data):
    return hashlib.sha256(data).hexdigest()

def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Production bundle mismatch: ' + old[:85])
    return text.replace(old, new)

def put(name, data):
    changed[name] = data.encode() if isinstance(data, str) else data

def read(name):
    return (root / name).read_text()

for helper in ['cashier-break-controls.cjs', 'home-read-cache.cjs']:
    put(helper, (source / helper).read_bytes())

workspace = '.next/server/chunks/9250.js'
call = 'l.b.listCandidates(d.z,{locationId:k.id,park:t,statuses:["SCHEDULED","OPEN"],...w,cashierBreaks:!0})'
put(workspace, once(read(workspace), call, 'require("/app/cashier-break-controls.cjs").listForCashier(d.z,{locationId:k.id,park:t,statuses:["SCHEDULED","OPEN"],...w})'))
page = '.next/server/app/(public)/page.js'
start = 'await Promise.all([(0,g.M)("content",f.h),(0,g.M)("locations",h.a).catch(()=>[])])'
put(page, once(read(page), start, 'await require("/app/home-read-cache.cjs").read(()=>'+start[6:]+')'))

manifest = json.loads(read('.next/app-build-manifest.json'))
cashier = '.next/' + manifest['pages']['/(cashier)/cashier/page'][-1]
body = read(cashier)
view = (source / 'cashier-break-controls-view.cjs').read_text().split('function CashierBreakControls',1)[1].split('module.exports',1)[0].strip()
end = body.index(';function StandaloneExtras(',body.index('function CashierBreakControls('))
body = body[:body.index('function CashierBreakControls(')] + 'function CashierBreakControls' + view + body[end:]
# Reuse the normal card's selection flow and all its quantity/price safeguards.
card = 'seatSessions.map(e=>{let t=e.publicId===ex,n=O(e,$.ticketTypes);return(0,s.jsxs)(r.P.button,{'
body = once(body, card, card+'id:"cashier-session-"+e.publicId,')
props = 'controls:$.cashierBreaks,shiftId:W.id,refresh:eQ'
body = once(body, props, props+',sessions:seatSessions,canSell:e=>!eT&&O(e,$.ticketTypes),selectSession:e=>{document.getElementById("cashier-session-"+e.publicId)?.click();document.getElementById("cashier-sale-panel")?.scrollIntoView({block:"start"})}')
renames = {}
def static_asset(name, data):
    old = re.search(r'([a-f0-9]{16})\.(?:js|css)$',name).group(1)
    new = digest(data.encode())[:16]
    put(name.replace(old, new), data)
    renames[old] = new
static_asset(cashier, body)
import io
for name, size, mode in [('hero-lemur.png',1600,'WEBP'),('gallery-1.png',1400,'WEBP'),('assets/lemur.png',640,'PNG'),('brand/lemuria-logo.png',256,'PNG')]:
    with Image.open(root/'public'/name) as im:
        im.thumbnail((size,size), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf,mode,**({'quality':83,'method':6} if mode=='WEBP' else {'optimize':True}))
        dest = str(Path(name).with_suffix('.webp')) if mode=='WEBP' else name
        put('public/'+dest,buf.getvalue())
        assert len(buf.getvalue()) < (root/'public'/name).stat().st_size
asset_manifest = read('.next/app-build-manifest.json')
sheets = [p for p in (root/'.next/static/css').glob('*.css')
          if p.name in asset_manifest and 'url(/hero-lemur.png)' in p.read_text()]
assert len(sheets)==1
sheet=sheets[0]
static_asset(str(sheet.relative_to(root)),sheet.read_text().replace('url(/hero-lemur.png)','url(/hero-lemur.webp)').replace('url(/gallery-1.png)','url(/gallery-1.webp)'))
for p in (root/'.next').rglob('*'):
    if p.suffix not in {'.js','.json','.html','.rsc','.txt','.meta','.css'} or not p.is_file(): continue
    name=str(p.relative_to(root))
    if name in (cashier,str(sheet.relative_to(root))): continue
    original=changed.get(name,p.read_bytes())
    out=original
    for old,new in renames.items(): out=out.replace(old.encode(),new.encode())
    if original != out:
        if name.startswith('.next/static/'): raise ValueError('Unexpected immutable dependency '+name)
        put(name,out)
assert '.next/app-build-manifest.json' in changed
with tarfile.open(layer,'w') as tar:
    for name,data in changed.items():
        if name.endswith(('.cjs','.js')):
            subprocess.run(['node','--check','-'],input=data,check=True)
        if name.endswith('.json'): json.loads(data)
        file=tarfile.TarInfo('app/'+name)
        file.size=len(data)
        tar.addfile(file,io.BytesIO(data))
print(json.dumps({'files':len(changed),'images':{k:len(v) for k,v in changed.items() if k.startswith('public/')},'layer':digest(layer.read_bytes())}))
