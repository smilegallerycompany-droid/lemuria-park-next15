#!/usr/bin/env python3
"""Read-only origin smoke checks. Never creates orders/reservations/payments."""
import datetime as dt
import json
import re
import ssl
import time
import urllib.request
from zoneinfo import ZoneInfo

SITE = 'https://xn--80ajjjbhwgdz8k.xn--p1ai'
CRM = 'https://crm.xn--80ajjjbhwgdz8k.xn--p1ai'
results = []

def get(url):
    start = time.monotonic()
    with urllib.request.urlopen(url, timeout=25, context=ssl.create_default_context()) as response:
        sock = response.fp.raw._sock
        tls = sock.version()
        body = response.read()
        assert response.status == 200
        assert response.url == url, 'Unexpected redirect: ' + response.url
        results.append({'url': url, 'status': response.status, 'seconds': round(time.monotonic()-start, 3), 'tls': tls})
        return body

now = dt.datetime.now(ZoneInfo('Europe/Moscow'))
for origin in [SITE, CRM]:
    html = get(origin + '/').decode()
    assert html.strip() and 'Лемурия' in html
    assert not re.search(r'API Gateway .*stopped|Application error', html)
    if origin == SITE:
        asset = re.search(r'(?:src|href)="(/_next/static/[^"?]+\.(?:js|css))', html)
        assert asset, 'No current asset in HTML'
        assert len(get(origin + asset[1])) > 100
    for path in ['/api/health/live', '/api/health/ready']:
        health = json.loads(get(origin + path))
        assert health['ok']
        if path.endswith('ready'):
            assert health['checks']['database'] == 'ok'
about = get(SITE + '/about').decode()
assert 'Лемурия' in about and len(about) > 1000
locations = json.loads(get(SITE + '/api/public/locations'))
assert locations['ok']
location = next(x for x in locations['data']['locations'] if x['slug'] == 'saratov')
assert location['latitude'] and location['longitude']
open_day = max(now.date().isoformat(), location['activeFrom'])
schedule = {'plannedUnavailable': True}
if location['isBookable'] and open_day <= location['activeTo']:
    dates = [s['localDate'] for s in location.get('nextSessions', []) if s['localDate'] >= open_day]
    if dates:
        open_day = min(dates)
        sessions = json.loads(get(SITE + '/api/public/sessions?locationSlug=saratov&date=' + open_day))
        assert sessions['ok']
        data = sessions['data']
        rows = data if isinstance(data, list) else data['sessions']
        times = [s['localTime'] for s in rows]
        schedule = {'date': open_day, 'count': len(times), 'times': times, 'after14': sum(t > '14:00' for t in times)}
print(json.dumps({'ok': True, 'checkedAtMoscow': now.isoformat(), 'results': results, 'databaseConnectivity': 'ok', 'fullDataIntegrityChecked': False, 'schedule': schedule}, ensure_ascii=False), flush=True)
