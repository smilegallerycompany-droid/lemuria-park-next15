#!/usr/bin/env python3
"""Read installed package metadata from an immutable image; never run its app.

Queries npm's official Bulk Advisory API with public package names/versions.
No install, dependency mutation, credentials or application data leave Cloud.
"""
import collections
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

release_path = Path(sys.argv[1]).resolve()
release = json.loads(release_path.read_text())
image = release['image']
assert re.fullmatch(r'cr\.yandex/crprmg5vv1ubl0u4fpad/lemuria-app@sha256:[a-f0-9]{64}', image)
crane = str(Path.home() / 'lemuria-crm-report-fix-20261104/tools/crane')
token = subprocess.check_output(['yc', 'iam', 'create-token'], text=True, timeout=30).strip()
packages = collections.defaultdict(set)
paths = []
with tempfile.TemporaryDirectory(prefix='lemuria-sbom-auth-') as authdir:
    env = dict(os.environ, DOCKER_CONFIG=authdir)
    auth = subprocess.run([crane, 'auth', 'login', 'cr.yandex', '-u', 'iam', '--password-stdin'],
                          input=token, text=True, capture_output=True, env=env, timeout=30)
    assert auth.returncode == 0, 'Registry authentication failed'
    print('Reading installed package metadata from pinned image', flush=True)
    proc = subprocess.Popen([crane, 'export', image, '-'], stdout=subprocess.PIPE, env=env)
    with tarfile.open(fileobj=proc.stdout, mode='r|') as archive:
        for item in archive:
            name = item.name.lstrip('./')
            if not item.isfile() or not name.startswith('app/node_modules/') or not name.endswith('/package.json'):
                continue
            assert item.size < 2000000
            try:
                meta = json.load(archive.extractfile(item))
            except (ValueError, UnicodeError):
                continue
            package, version = meta.get('name'), meta.get('version')
            if meta.get('private') or not isinstance(package, str) or not isinstance(version, str):
                continue
            if not re.fullmatch(r'(?:@[a-z0-9_.-]+/)?[a-z0-9_.-]+', package):
                continue
            if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][A-Za-z0-9_.-]+)?', version):
                continue
            packages[package].add(version)
            paths.append({'name': package, 'version': version, 'path': name})
    assert proc.wait() == 0, 'Image export failed'
assert packages and 'next' in packages and 'react' in packages
inventory = {name: sorted(versions) for name, versions in sorted(packages.items())}
request = urllib.request.Request('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    data=json.dumps(inventory).encode(), method='POST', headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=45) as response:
    advisories = json.load(response)
result = {'image': image, 'packageNames': len(inventory), 'packageManifests': len(paths),
          'versions': inventory, 'paths': paths, 'advisories': advisories,
          'scope': 'Known advisories from installed manifests; not an exploitability or vendored-code proof'}
out = release_path.parent / 'runtime-app-dependencies.json'
fd = os.open(out, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'w') as file:
    json.dump(result, file, indent=2)
print(json.dumps({'packageNames': len(inventory), 'packageManifests': len(paths),
    'frameworks': {p: inventory.get(p) for p in ['next', 'react', 'react-dom', '@prisma/client']},
    'advisories': {p: [{'severity': a['severity'], 'title': a['title'],
        'vulnerable_versions': a['vulnerable_versions'], 'url': a['url']}
        for a in items] for p, items in advisories.items()}}, ensure_ascii=False))
