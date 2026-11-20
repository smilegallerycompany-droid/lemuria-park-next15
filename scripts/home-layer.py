"""Build a homepage-only layer using public CMS data and the active Next manifests."""
import hashlib, io, json, re, subprocess, sys, tarfile
from pathlib import Path

root, cms, places, target = map(Path, sys.argv[1:])
def load(path):
    payload = json.loads(path.read_text())
    assert payload['ok'] is True
    return payload['data']

content = load(cms)
assert content.get('hero') and content['locations']['locations']
content['_refreshHome'] = True
content['schedulePreview'] = []
def strip_sessions(locations):
    for location in locations:
        location['nextSessions'] = []
strip_sessions(content['locations']['locations'])
locations = load(places)['locations']
strip_sessions(locations)
changes = {
    'home-read-cache.cjs': Path(__file__).with_name('home-fast.cjs').read_bytes(),
    'home-public-seed.json': json.dumps([content, locations], ensure_ascii=False).encode(),
}

def once(body, old, new):
    assert body.count(old) == 1, old
    return body.replace(old, new)

server = '.next/server/app/(public)/page.js'
body = (root/server).read_text()
assert 'require("/app/home-read-cache.cjs").read(' in body
anchor = 'children:[(0,d.jsx)("script",{type:"application/ld+json"'
body = once(body, anchor, 'children:[a?.hero?(0,d.jsx)("link",{rel:"preload",as:"image",fetchPriority:"high",href:a.hero.imageUrl&&a.hero.imageUrl!=="/hero-lemur.png"?a.hero.imageUrl:"/hero-lemur.webp"}):null,(0,d.jsx)("script",{type:"application/ld+json"')
changes[server] = body.encode()
manifest = json.loads((root/'.next/app-build-manifest.json').read_text())
old_name = '.next/' + manifest['pages']['/(public)/page'][-1]
body = (root/old_name).read_text()
body = once(body, '_||fetch("/api/public/content")', '(!_||_._refreshHome)&&fetch("/api/public/content")')
old_hash = re.search(r'-([a-f0-9]{16})\.js$',old_name)[1]
new_hash = hashlib.sha256(body.encode()).hexdigest()[:16]
changes[old_name.replace(old_hash,new_hash)] = body.encode()
active_sheet = '.next/static/css/aac3dbc30195215e.css'
styles = (root/active_sheet).read_text()
assert '/hero-lemur.png' in styles
styles = styles.replace('/hero-lemur.png', '/hero-lemur.webp').replace('/gallery-1.png', '/gallery-1.webp')
old_css = Path(active_sheet).stem
new_css = hashlib.sha256(styles.encode()).hexdigest()[:16]
changes[active_sheet.replace(old_css, new_css)] = styles.encode()
for p in (root/'.next').rglob('*'):
    if not p.is_file() or p.suffix not in {'.json','.js','.html','.rsc','.meta','.txt'}: continue
    name = str(p.relative_to(root))
    if name in (old_name, active_sheet): continue
    data = changes.get(name,p.read_bytes())
    if old_hash.encode() in data or old_css.encode() in data:
        assert not name.startswith('.next/static/'), name
        changes[name] = data.replace(old_hash.encode(),new_hash.encode()).replace(old_css.encode(),new_css.encode())
assert '.next/app-build-manifest.json' in changes
with tarfile.open(target,'w') as tar:
    for name,data in changes.items():
        if name.endswith(('.js','.cjs')): subprocess.run(['node','--check','-'],input=data,check=True)
        if name.endswith('.json'): json.loads(data)
        info = tarfile.TarInfo('app/'+name)
        info.size = len(data)
        tar.addfile(info,io.BytesIO(data))
print('Validated',len(changes),'files, asset',new_hash)
