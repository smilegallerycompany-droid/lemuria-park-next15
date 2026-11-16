"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");

const BASE = "sha256:ad9298fe7c48cc896bc79d674493a13328ae02f67d5f8b60da3520073b7450d8";
const SOLD_OUT_RELEASE = "491cdd7f4135cd3021454ae568d1ea532a755502";
const SESSION_LIST = "(cashier)/cashier/sessions";
const WORKSPACE = "(cashier)/cashier";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function replace(body, search, replacement, count = 1) {
  assert.equal(body.split(search).length - 1, count, "Unexpected match count for " + search);
  return body.replaceAll(search, () => replacement);
}

function patchSalePolicy(body) {
  // The timestamp substitution is limited to the cashier checks. The
  // original start time still reaches the park schedule and pricing rules.
  body = replace(body, "(0,h.S_)(i,g)",
    "(0,h.S_)(i&&{...i,startsAt:i.endsAt},new Date)");
  return replace(body, "(0,h.S_)(r,j)",
    "(0,h.S_)(r&&{...r,startsAt:r.endsAt},new Date)");
}

function patchSaleRoute(body) {
  return replace(body, "let q=p.items,r=p.totalAmount,s=await O.n.createCashierPaid",
    'if(j.endsAt.getTime()<=Date.now()||o&&o.endsAt.getTime()<=Date.now())throw new E.J("SESSION_NOT_AVAILABLE","Продажи на сеанс закрыты");let q=p.items,r=p.totalAmount,s=await O.n.createCashierPaid');
}

function patchWorkspaceService(body) {
  body = replace(body, "sessions:x.map(a=>{let b=z.get(a.id)",
    "sessions:x.filter(a=>a.endsAt.getTime()>Date.now()).map(a=>{let b=z.get(a.id)");
  return replace(body, "startsAt:a.startsAt.toISOString(),capacity:",
    "startsAt:a.startsAt.toISOString(),endsAt:a.endsAt.toISOString(),capacity:");
}

function patchSessionsRoute(body) {
  return replace(body,
    "({publicId:a,localTime:b,startsAt:c,remaining:d,soldOut:e})=>({publicId:a,localTime:b,startsAt:c,remaining:d,soldOut:e})",
    "({publicId:a,localTime:b,startsAt:c,remaining:d,soldOut:e,endsAt:f})=>({publicId:a,localTime:b,startsAt:c,remaining:d,soldOut:e,endsAt:f})");
}

function patchWorkspacePage(body) {
  body = replace(body, "Date.parse(session.startsAt)", "Date.parse(session.endsAt)", 4);
  return replace(body, "Date.parse(e.startsAt)", "Date.parse(e.endsAt)");
}

function patchSessionsPage(body) {
  body = replace(body, ",[r,u]=(0,i.useState)(null);return(0,i.useEffect)",
    ",[r,u]=(0,i.useState)(null),[cashierNow,setCashierNow]=(0,i.useState)(Date.now);(0,i.useEffect)(()=>{let update=()=>setCashierNow(Date.now());update();let timer=window.setInterval(update,1000);document.addEventListener('visibilitychange',update);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update)}},[]);let cashierSessions=t?.sessions.filter(session=>Date.parse(session.endsAt)>cashierNow)??[];return(0,i.useEffect)");
  body = replace(body, "t.sessions.map(e=>", "cashierSessions.map(e=>");
  return replace(body, "0===t.sessions.length", "0===cashierSessions.length");
}

function walk(root, directory, files) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) walk(root, relative, files);
    else if (/\.(js|json|html|rsc|meta|txt|css)$/.test(relative)) {
      files.set(relative, fs.readFileSync(path.join(root, relative), "utf8"));
    }
  }
}

function loadModule(body, id, deps, clock) {
  const exports = {};
  new Script(body).runInNewContext({ exports, Date: clock });
  const imported = (id) => deps[id] ?? {};
  imported.d = (target, getters) => {
    for (const [key, get] of Object.entries(getters)) Object.defineProperty(target, key, { get });
  };
  const result = {};
  exports.modules[id]({ exports: result }, result, imported);
  return result;
}

async function verifyTimeBoundary(domainBundle, saleBundle) {
  const startsAt = new Date("2026-11-16T07:30:00Z");
  const endsAt = new Date("2026-11-16T07:50:00Z");
  let observed = new Date("2026-11-16T07:32:00Z");
  class TestClock extends Date {
    constructor(...args) { super(...(args.length ? args : [observed.getTime()])); }
    static now() { return observed.getTime(); }
  }
  class DomainError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const location = { status: "ACTIVE", park: "LEMURIA" };
  const session = { status: "SCHEDULED", park: "LEMURIA", locationId: "qa", location, startsAt, endsAt };
  const domain = loadModule(domainBundle, 32661, { 55940: { J: DomainError } }, TestClock);
  const sale = loadModule(saleBundle, 84506, {
    32661: domain,
    55940: { J: DomainError },
    5813: { b: { findByPublicId: async () => session } },
    85261: { L: async () => {} },
    77114: { SE: async () => ({ id: "qa-shift" }) },
  }, TestClock);
  const validate = () => sale.gi({}, { sessionPublicId: "qa", cashierId: "qa", now: observed });
  assert.equal(domain.cW(session, observed), false, "Online must still close at session start");
  assert.equal((await validate()).session, session, "Cashier must accept the session at 11:32");
  observed = new Date(endsAt.getTime() - 1);
  await validate();
  observed = endsAt;
  await assert.rejects(validate, { code: "SESSION_NOT_AVAILABLE" });
  observed = startsAt;
  session.status = "CANCELLED";
  await assert.rejects(validate, { code: "SESSION_NOT_AVAILABLE" });
}

async function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const preserved = JSON.parse(fs.readFileSync(path.join(root, "public/sold-out-release.json")));
  assert.equal(preserved.sourceCommit, SOLD_OUT_RELEASE);
  const originals = new Map();
  walk(root, ".next", originals);
  const files = new Map(originals);
  const manifest = JSON.parse(originals.get(".next/app-build-manifest.json"));
  const lastAsset = (page) => ".next/" + manifest.pages["/" + page + "/page"].at(-1);
  const patches = new Map([
    [".next/server/chunks/692.js", patchSalePolicy],
    [".next/server/chunks/9250.js", patchWorkspaceService],
    [".next/server/app/api/cashier/sales/route.js", patchSaleRoute],
    [".next/server/app/api/cashier/sessions/route.js", patchSessionsRoute],
    [lastAsset(WORKSPACE), patchWorkspacePage],
    [lastAsset(SESSION_LIST), patchSessionsPage],
  ]);
  assert.equal(patches.size, 6);
  for (const [relative, patch] of patches) {
    assert.ok(files.has(relative), "Missing expected bundle: " + relative);
    files.set(relative, patch(files.get(relative)));
  }
  await verifyTimeBoundary(files.get(".next/server/chunks/1321.js"), files.get(".next/server/chunks/692.js"));
  // Existing browser caches must keep resolving their immutable asset URLs.
  // Give the changed chunks new URLs and update the manifests that reference them.
  for (let pass = 0; ; pass++) {
    const renames = new Map();
    for (const [relative, body] of files) {
      if (!relative.startsWith(".next/static/") || originals.get(relative) === body) continue;
      const old = relative.match(/-([a-f0-9]{16})\.(?:js|css)$/)?.[1];
      assert.ok(old, "Unexpected static asset filename: " + relative);
      const next = sha256(body).slice(0, old.length);
      if (old === next) continue;
      renames.set(old, next);
      files.delete(relative);
      files.set(relative.replace(old, next), body);
    }
    if (renames.size === 0) break;
    assert.ok(pass < 12, "Static references did not converge");
    for (const [relative, body] of files) {
      let updated = body;
      for (const [old, next] of renames) updated = updated.replaceAll(old, next);
      files.set(relative, updated);
    }
  }
  assert.ok(originals.has(preserved.booking), "Missing public sold-out booking asset");
  assert.equal(files.get(preserved.booking), originals.get(preserved.booking),
    "Public sold-out booking asset must be byte-identical");
  const changed = [];
  for (const [relative, body] of files) {
    if (originals.get(relative) === body) continue;
    if (relative.endsWith(".js")) new Script(body, { filename: relative });
    if (relative.endsWith(".json")) JSON.parse(body);
    changed.push({ path: relative, sha256: sha256(body) });
  }
  const release = {
    releaseId: "cashier-end-time-" + commit.slice(0, 8),
    sourceCommit: commit,
    baseImageDigest: BASE,
    preservedSoldOutRelease: SOLD_OUT_RELEASE,
    cashierBoundaryVerified: true,
    files: changed,
  };
  for (const { path: relative } of changed) {
    fs.writeFileSync(path.join(root, relative), files.get(relative));
  }
  fs.writeFileSync(path.join(root, "public/cashier-end-time-release.json"), JSON.stringify(release) + "\n");
  return release;
}

module.exports = { BASE, build, patchSalePolicy, patchWorkspacePage, patchSessionsPage };
if (require.main === module) {
  build(path.resolve(process.argv[2]), process.argv[3]).then((result) => {
    console.log(JSON.stringify(result));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
