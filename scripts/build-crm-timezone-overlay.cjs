#!/usr/bin/env node
"use strict";
// Immutable-artifact patch: only overview session display, no business/DB changes.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), cp = require("node:child_process");
const BASE_DIGEST = "sha256:c524919964093de59cfe2449ef9a6bfe48925b04eae1a0d811e9b37b0bac9589";

function patchOverview(body) {
  assert.ok(body.includes("Смены сегодня") && body.includes("Ближайшие сеансы"), "Expected overview module");
  const maps = [...body.matchAll(/([A-Za-z_$][\w$]*)\.sessions\.map\(([A-Za-z_$][\w$]*)=>/g)];
  assert.equal(maps.length, 1, "Exactly one session table");
  const [, data, row] = maps[0];
  const calls = [...body.matchAll(/(\(0,[A-Za-z_$][\w$]*\.r6\))\(([A-Za-z_$][\w$]*)\.startsAt\)/g)]
    .filter(m => m[2] === row && m.index > maps[0].index);
  assert.equal(calls.length, 1, "Exactly one default-timezone session cell");
  const old = calls[0][0];
  const replacement = `${calls[0][1]}(${row}.startsAt,${data}.locations?.find(loc=>loc.id===${row}.location?.id)?.timezone??${data}.timezone??"Europe/Moscow")`;
  return { body: body.replace(old, replacement), old, replacement };
}

function build(root, commit) {
  assert.match(commit || "", /^[a-f0-9]{40}$/);
  const prior = JSON.parse(fs.readFileSync(path.join(root, "public/crm-release.json"), "utf8"));
  assert.equal(prior.releaseId, "crm-admin-reports-20261104-10a09198", "Exact production base required");
  const files = new Map(), originals = new Map();
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (/\.(js|json|css|html|rsc|meta|txt)$/.test(e.name)) {
        const relative = path.relative(root, file), body = fs.readFileSync(file, "utf8");
        files.set(relative, body); originals.set(relative, body);
      }
    }
  }
  walk(path.join(root, ".next"));
  const counts = { client: 0, server: 0 };
  for (const [file, body] of files) {
    if (!body.includes("Смены сегодня") || !body.includes("Ближайшие сеансы")) continue;
    if (file === ".next/server/app/director/page.js") {
      files.set(file, patchOverview(body).body); counts.server++;
    } else if (/^\.next\/static\/chunks\/app\/director\/page-[a-f0-9]+\.js$/.test(file)) {
      files.set(file, patchOverview(body).body); counts.client++;
    }
  }
  assert.deepEqual(counts, { client: 1, server: 1 });
  const hash = body => crypto.createHash("sha256").update(body).digest("hex");
  const renamed = [];
  for (let pass = 0; pass < 12; pass++) {
    const changes = [];
    for (const [file, body] of files) {
      if (!file.startsWith(".next/static/") || originals.get(file) === body) continue;
      const match = file.match(/(?:-|\/)([a-f0-9]{16,32})\.(?:js|css)$/);
      if (!match) continue;
      const next = hash(body).slice(0, match[1].length);
      if (next !== match[1]) changes.push({ file, old: match[1], next, to: file.replace(match[1], next) });
    }
    if (!changes.length) break;
    assert.ok(pass < 11, "Asset references must converge");
    for (const c of changes) { const b = files.get(c.file); files.delete(c.file); files.set(c.to, b); renamed.push(c); }
    for (const [file, body] of files) {
      let next = body;
      for (const c of changes) next = next.replaceAll(c.old, c.next);
      files.set(file, next);
    }
  }
  const output = [];
  for (const [file, body] of files) {
    if (originals.get(file) === body) continue;
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body);
    if (file.endsWith(".json")) JSON.parse(body);
    if (file.endsWith(".js")) cp.execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
    output.push({ path: file, sha256: hash(body), bytes: Buffer.byteLength(body) });
  }
  const manifest = {
    releaseId: "crm-localtime-20261106-" + commit.slice(0, 8), sourceCommit: commit,
    baseImageDigest: BASE_DIGEST, builtAt: new Date().toISOString(), counts,
    renamedAssets: renamed, files: output,
    databaseMigrations: false, scope: "Overview sessions use each location timezone; all business services preserved",
  };
  fs.writeFileSync(path.join(root, "public/crm-release.json"), JSON.stringify(manifest, null, 2) + "\n");
  output.push({ path: "public/crm-release.json" });
  fs.writeFileSync(path.join(root, "crm-timezone-overlay-files.json"), JSON.stringify(output, null, 2) + "\n");
  return { releaseId: manifest.releaseId, counts, files: output.length, syntaxChecks: "passed" };
}
module.exports = { patchOverview, build, BASE_DIGEST };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2] || ""), process.argv[3])));
