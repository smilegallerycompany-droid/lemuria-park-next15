"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");

const BASE = "sha256:d160c3a2955548650cfcff1057b3d4cd8c661ff8d9f6c753c052eb0fce64f29b";
const PREVIOUS = "cd428586ba09460c90f9f0885d5fbb0dd328d834";
const checksum = (s) => createHash("sha256").update(s).digest("hex");

const policy = 'require("/app/cashier-seat-reserve.cjs")';

function replace(body, before, after, count = 1) {
  assert.equal(body.split(before).length - 1, count, "Expected match for " + before);
  return body.replaceAll(before, () => after);
}

function patchView(body) {
  const field = 'null!=(g=null==eY?void 0:eY.remaining)?g:0';
  body = replace(body, field, '(eY?.remaining??0)+(eY?.reserveRemaining??0)');
  body = replace(body, 'remainingSeats:eY.remaining', 'remainingSeats:eY.remaining+(eY.reserveRemaining??0)', 2);
  body = replace(body, 'children:["Свободно ",eY.remaining," из ",eY.capacity]',
    'children:["Свободно ",eY.remaining," из ",eY.capacity,eY.reserveRemaining?" · Резерв кассы: "+eY.reserveRemaining:""]');
  body = replace(body, 'e.remaining<=3?(0,s.jsx)(w,{variant:"warning",children:"Мало мест"})',
    '0===e.remaining&&e.reserveRemaining?(0,s.jsx)(w,{variant:"warning",children:"Резерв кассы: "+e.reserveRemaining}):e.remaining<=3?(0,s.jsx)(w,{variant:"warning",children:"Мало мест"})');
  return replace(body, 'children:[e.localTime," \\xb7 ",e.remaining," мест"]',
    'children:[e.localTime," \\xb7 ",e.remaining," мест",e.reserveRemaining?" + резерв "+e.reserveRemaining:""]');
}

function patchServer(files, changed) {
  function patch(name, callback) {
    const file = ".next/server/" + name;
    changed.set(file, callback(files.get(file)));
  }

  patch("chunks/692.js", (body) => {
    body = replace(body, '(0,g.vu)(a,j)', '(0,g.vu)(' + policy + '.forSale(a,f),j)');
    return replace(body, '(0,g.vu)(await (0,m.so)(a,r.id,j),(0,k.C3)(o,t))',
      '(0,g.vu)(' + policy + '.forSale(await (0,m.so)(a,r.id,j),r),(0,k.C3)(o,t))');
  });
  patch("app/api/cashier/sales/route.js", (body) => replace(body,
    '(0,F.vu)(b,n)', '(0,F.vu)(' + policy + '.forSale(b,j),n)'));
  patch("chunks/9250.js", (body) => replace(body,
    'capacity:b.capacity,sold:b.booked,remaining:b.available,soldOut:b.available<=0',
    '...' + policy + '.forList(b,a,k)'));
  patch("app/api/cashier/sessions/route.js", (body) => replace(body,
    'remaining:d,soldOut:e,endsAt:f})=>({publicId:a,localTime:b,startsAt:c,remaining:d,soldOut:e,endsAt:f})',
    'remaining:d,soldOut:e,endsAt:f,reserveRemaining:g})=>({publicId:a,localTime:b,startsAt:c,remaining:d,soldOut:e,endsAt:f,reserveRemaining:g})'));
}

function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/cashier-ticket-correction-release.json")));
  assert.equal(previous.sourceCommit, PREVIOUS);
  const files = new Map();
  function walk(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(js|json|html|rsc|meta|txt)$/.test(relative)) {
        files.set(relative, fs.readFileSync(path.join(root, relative), "utf8"));
      }
    }
  }
  walk(".next");
  const manifest = JSON.parse(files.get(".next/app-build-manifest.json"));
  const oldAsset = ".next/" + manifest.pages["/(cashier)/cashier/page"].at(-1);
  const oldHash = oldAsset.match(/-([a-f0-9]{16})\.js$/)?.[1];
  assert.ok(oldHash);
  const patched = patchView(files.get(oldAsset));
  const newHash = checksum(patched).slice(0, oldHash.length);
  assert.notEqual(oldHash, newHash);
  const asset = oldAsset.replace(oldHash, newHash);
  const changed = new Map([[asset, patched]]);
  for (const [relative, body] of files) {
    if (relative !== oldAsset && body.includes(oldHash)) {
      assert.ok(!relative.startsWith(".next/static/"), "Unanticipated reference in a hashed static asset");
      changed.set(relative, body.replaceAll(oldHash, newHash));
    }
  }
  assert.ok(changed.has(".next/app-build-manifest.json"));
  patchServer(files, changed);
  changed.set("cashier-seat-reserve.cjs", fs.readFileSync(path.join(__dirname, "cashier-seat-reserve.cjs"), "utf8"));
  const output = [];
  for (const [relative, body] of changed) {
    if (/\.[c]?js$/.test(relative)) new Script(body, { filename: relative });
    if (relative.endsWith(".json")) JSON.parse(body);
    fs.writeFileSync(path.join(root, relative), body);
    output.push({ path: relative, sha256: checksum(body) });
  }
  const result = {
    releaseId: "cashier-seat-reserve-" + commit.slice(0, 8),
    sourceCommit: commit, baseImageDigest: BASE, previousRelease: previous.releaseId,
    asset, files: output,
  };
  fs.writeFileSync(path.join(root, "public/cashier-seat-reserve-release.json"), JSON.stringify(result) + "\n");
  return result;
}

module.exports = { BASE, build, patchServer, patchView };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
