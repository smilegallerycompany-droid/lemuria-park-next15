#!/usr/bin/env python3
"""Read-only release checks; optional staging-only map fixture from public data."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote, urlparse

ROOT = Path('/tmp/lemuria-release')

def secret(row, name):
    env = row['image'].get('environment', {})
    if env.get(name): return env[name]
    refs = [item for item in row.get('secrets', []) if item.get('environmentVariable') == name]
    if len(refs) != 1: return None
    ref = refs[0]
    args = ['yc', 'lockbox', 'payload', 'get', '--id', ref['id'], '--format', 'json-rest']
    if ref.get('versionId'): args += ['--version-id', ref['versionId']]
    data = json.loads(subprocess.check_output(args, text=True))
    entry = next(item for item in data['entries'] if item['key'] == ref['key'])
    return entry.get('textValue', entry.get('text_value'))

def connection(row):
    env = row['image'].get('environment', {})
    direct = secret(row, 'DATABASE_URL')
    if direct: return direct + ('&' if '?' in direct else '?') + 'connect_timeout=5&pool_timeout=5&connection_limit=1'
    password = secret(row, 'DB_PASSWORD')
    assert password and env.get('DB_NAME') and env.get('DB_HOST')
    return 'postgresql://' + quote(env['DB_USER'], safe='') + ':' + quote(password, safe='') + '@' + env['DB_HOST'] + ':' + env.get('DB_PORT', '6432') + '/' + env['DB_NAME'] + '?sslmode=require&connect_timeout=5&pool_timeout=5&connection_limit=1'

READ_ONLY = r'''
const fs = require('node:fs');
const {PrismaClient} = require('/tmp/lemuria-release/rootfs/app/node_modules/@prisma/client');
const prisma = new PrismaClient({log:[]});
(async()=>{
 const result = await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const identity = await tx.$queryRawUnsafe('SELECT current_database() AS database, current_setting(\'server_version\') AS version, now() AS checked_at');
  const locations = await tx.location.findMany({where:{status:{in:['ACTIVE','UPCOMING']}},select:{slug:true,timezone:true,latitude:true,longitude:true,mapUrl:true,activeFrom:true,activeTo:true}});
  const sessions = await tx.$queryRawUnsafe(`SELECT l.slug, COUNT(*)::int AS future_sessions, COUNT(*) FILTER (WHERE (s."startsAt" AT TIME ZONE l.timezone)::time > '14:00'::time)::int AS after_14, MIN(s."startsAt") AS first_session, MAX(s."startsAt") AS last_session FROM "Session" s JOIN "Location" l ON l.id=s."locationId" WHERE s."startsAt">now() AND s.status IN ('SCHEDULED','OPEN') GROUP BY l.slug ORDER BY l.slug`);
  return {identity,locations,sessions};
 },{timeout:15000});
 console.log(JSON.stringify(result));
})().catch(e=>{console.error('DB_CHECK_FAILED',e.code||e.name);process.exitCode=1}).finally(()=>prisma.$disconnect());
'''

STAGING_MAP = r'''
const fs = require('node:fs');
const {PrismaClient} = require('/tmp/lemuria-release/rootfs/app/node_modules/@prisma/client');
const prisma = new PrismaClient({log:[]});
(async()=>{
 const [{database}] = await prisma.$queryRawUnsafe('SELECT current_database() AS database');
 if(database!=='lemuria_staging')throw new Error('STAGING_ONLY');
 const before=await prisma.location.findUniqueOrThrow({where:{slug:'saratov'},select:{latitude:true,longitude:true,mapUrl:true,routeUrl:true}});
 const backup='/tmp/lemuria-release/staging-saratov-map-before.json';
 if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(before,null,2));
 const location=await prisma.location.update({where:{slug:'saratov'},data:{latitude:51.62132,longitude:45.972246,mapUrl:'https://yandex.ru/maps/-/CXfwJNLa'},select:{slug:true,latitude:true,longitude:true,mapUrl:true}});
 console.log(JSON.stringify({database,location}));
})().catch(e=>{console.error('STAGING_MAP_FAILED',e.code||e.name);process.exitCode=1}).finally(()=>prisma.$disconnect());
'''

target = sys.argv[1]
assert target in ['production','staging']
row = json.loads((ROOT / (target + '-before.json')).read_text())
url = connection(row)
database = urlparse(url).path.strip('/')
assert database == ('lemuria_staging' if target == 'staging' else 'lemuria')
mutate = len(sys.argv) > 2 and sys.argv[2] == 'map-fixture'
assert not mutate or target == 'staging'
env = dict(os.environ, DATABASE_URL=url)
result = subprocess.run(['node'], input=STAGING_MAP if mutate else READ_ONLY, text=True, env=env, capture_output=True, timeout=35)
if result.returncode:
    print(json.dumps({'target':target,'ok':False,'error':result.stderr.strip()[-180:]}))
    raise SystemExit(result.returncode)
data = json.loads(result.stdout)
(ROOT / (target + ('-map-fixture' if mutate else '-db-audit') + '.json')).write_text(json.dumps(data,indent=2))
print(json.dumps({'target':target,'ok':True,'data':data},ensure_ascii=False))
