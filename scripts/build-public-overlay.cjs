#!/usr/bin/env node
"use strict";

/**
 * Public hotfix for the *observed* 2026-10-19 production image.
 *
 * The GitHub snapshot predates production's observer/PDF/accounting features.
 * Rebuilding the whole snapshot would remove those features. This narrowly
 * scoped, fail-closed artifact overlay carries PR #1's public fixes onto the
 * pinned production image. No application services, dependencies, Prisma
 * client/schema, database, secrets, payment code or staff UI are rebuilt.
 *
 * Usage: node scripts/build-public-overlay.cjs <exported-/app> <git-commit>
 * Output: overlay-files.json lists files to ADD to the pinned base image.
 * Keep original static chunks in the base; new content gets new asset names.
 * Deploy the same resulting image digest to staging, then production.
 * Rollback is the untouched prior image/revision; no database rollback needed.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const assert = require("node:assert/strict");

const root = path.resolve(process.argv[2] || "");
const sourceCommit = process.argv[3];
assert.match(sourceCommit || "", /^[a-f0-9]{40}$/, "Full source commit required");
const releaseId = `public-sessions-metrika-maps-20261101-${sourceCommit.slice(0, 8)}`;
const baseDigest = "sha256:864ec15ed7cff7a28df1a45a9f6e1c404bad992fb58e234c1fc235280bb864f1";
const nextDir = path.join(root, ".next");
assert.ok(fs.existsSync(path.join(nextDir, "BUILD_ID")), "Exported production app required");
assert.ok(fs.existsSync(path.join(root, "release-manifest.json")), "Base release provenance required");
const baseRelease = JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8"));
assert.ok(JSON.stringify(baseRelease).includes("release-pdf-layout-fix-20261019"), "Unexpected base release");

const digest = (body) => crypto.createHash("sha256").update(body).digest("hex");
const files = new Map();
const originals = new Map();
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const filename = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(filename);
    else if (ent.isFile() && /\.(js|json|html|rsc|meta|txt)$/.test(ent.name)) {
      const rel = path.relative(root, filename);
      const body = fs.readFileSync(filename, "utf8");
      files.set(rel, body);
      originals.set(rel, body);
    }
  }
}
walk(nextDir);

let bookingClient = 0, bookingServer = 0, mapClient = 0, mapServer = 0;
const changedLogic = [];
for (const [filename, original] of files) {
  if (!filename.endsWith(".js")) continue;
  let body = original;
  if (body.includes("Показаны ближайшие") && body.includes("Ближайшее время")) {
    const limiter = /\.sort\(\((\w+),(\w+)\)=>\1\.startsAt\.localeCompare\(\2\.startsAt\)\)\.slice\(0,8\)/g;
    const matches = [...body.matchAll(limiter)];
    if (matches.length) {
      assert.equal(matches.length, 1, `Ambiguous booking limit: ${filename}`);
      body = body.replace(limiter, (matched) => matched.replace(/\.slice\(0,8\)$/, ""));
      body = body.replaceAll("Показаны ближайшие доступные сеансы на выбранный день", "Показаны все свободные сеансы на выбранный день")
        .replaceAll("Показаны ближайшие свободные сеансы на выбранный день", "Показаны все свободные сеансы на выбранный день")
        .replaceAll("Только ближайшие сеансы", "Все доступные сеансы");
      if (filename.startsWith(".next/static/")) bookingClient++; else bookingServer++;
    }
  }
  if (body.includes("location-map-embed-footer")) {
    // Preserve explicit trusted widget URLs and the existing map/route logic.
    // If only a normal Maps link is configured, use the DB's validated point.
    const widget = /(\w+)=null!=\((\w+)=(\w+)\((\w+)\.mapUrl\)\)\?\2:\3\(\4\.routeUrl\)/g;
    const matches = [...body.matchAll(widget)];
    if (matches.length) {
      assert.equal(matches.length, 1, `Ambiguous map widget: ${filename}`);
      body = body.replace(widget, (_, result, unused, trusted, location) =>
        `${result}=${trusted}(${location}.mapUrl)||${trusted}(${location}.routeUrl)||` +
        `((typeof ${location}.latitude==="number"&&Number.isFinite(${location}.latitude)&&Math.abs(${location}.latitude)<=90&&typeof ${location}.longitude==="number"&&Number.isFinite(${location}.longitude)&&Math.abs(${location}.longitude)<=180)?` +
        `"https://yandex.ru/map-widget/v1/?ll="+encodeURIComponent(${location}.longitude+","+${location}.latitude)+"&pt="+encodeURIComponent(${location}.longitude+","+${location}.latitude+",pm2rdm")+"&z="+Math.min(21,Math.max(1,${location}.mapZoom||16)):null)`);
      if (filename.startsWith(".next/static/")) mapClient++; else mapServer++;
    }
  }
  if (body !== original) {
    files.set(filename, body);
    changedLogic.push(filename);
  }
}
assert.equal(bookingClient, 1, "Exactly one public booking client chunk expected");
assert.ok(bookingServer >= 1, "Server-rendered booking copy must also be patched");
assert.equal(mapClient, 1, "Exactly one public map client chunk expected");
assert.ok(mapServer >= 1, "Server-rendered map copy must also be patched");

const mainEntries = [...files.keys()].filter((name) => /^\.next\/static\/chunks\/main-app-[a-f0-9]+\.js$/.test(name));
assert.equal(mainEntries.length, 1, "Expected one main app entry");
const analytics = `\n;(()=>{try{document.documentElement.dataset.lemuriaRelease=${JSON.stringify(releaseId)};` +
  `if(!/^(?:www\\.)?xn--80ajjjbhwgdz8k\\.xn--p1ai$/.test(location.hostname)||/^\\/(?:admin|director|cashier|owner|observer|login|api)(?:\\/|$)/.test(location.pathname)||window.__lemuriaMetrika113976341)return;` +
  `window.__lemuriaMetrika113976341=true;window.dataLayer=window.dataLayer||[];` +
  `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}k=e.createElement(t);a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;k.id="yandex-metrika-113976341";a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=113976341","ym");` +
  `ym(113976341,"init",{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});` +
  `}catch(e){console.warn("Public analytics could not initialize")}})();\n`;
assert.ok(!files.get(mainEntries[0]).includes("113976341"), "Counter already present in base entry");
files.set(mainEntries[0], files.get(mainEntries[0]) + analytics);
changedLogic.push(mainEntries[0]);

// Immutable client assets must get new URLs. Rewrite all generated references,
// including webpack's chunk hash table and RSC/SSR manifests. Repeat because
// rewriting the chunk table also changes the webpack runtime's own hash.
const renamed = [];
for (let pass = 0; pass < 10; pass++) {
  const changes = [];
  for (const [filename, body] of files) {
    if (!filename.startsWith(".next/static/") || originals.get(filename) === body) continue;
    const match = filename.match(/-([a-f0-9]{16})\.js$/);
    if (!match) continue;
    const newHash = digest(body).slice(0, 16);
    if (newHash === match[1]) continue;
    changes.push({ filename, hash: match[1], newHash, to: filename.replace(/-[a-f0-9]{16}\.js$/, `-${newHash}.js`) });
  }
  if (!changes.length) break;
  assert.ok(pass < 9, "Asset references did not converge");
  for (const change of changes) {
    const body = files.get(change.filename);
    files.delete(change.filename);
    files.set(change.to, body);
    renamed.push(change);
  }
  for (const [filename, original] of files) {
    let body = original;
    for (const change of changes) body = body.replaceAll(change.hash, change.newHash);
    files.set(filename, body);
  }
}

const output = [];
for (const [filename, body] of files) {
  if (originals.get(filename) === body) continue;
  if (filename.endsWith(".json")) JSON.parse(body);
  const full = path.join(root, filename);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  if (filename.endsWith(".js")) cp.execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
  output.push({ path: filename, sha256: digest(body), bytes: Buffer.byteLength(body) });
}
assert.ok(output.length >= 7, "Incomplete generated overlay");
const manifest = {
  releaseId, sourceCommit, sourcePullRequest: 1,
  baseImageDigest: baseDigest,
  previousProductionRevision: "bba22mg3efqv7u8jrr5b",
  builtAt: new Date().toISOString(),
  mode: "public-artifact-overlay-preserving-production-backend",
  databaseMigrations: false,
  changedLogic, renamedAssets: renamed,
  files: output,
};
fs.writeFileSync(path.join(root, "public", "public-release.json"), JSON.stringify(manifest, null, 2) + "\n");
output.push({ path: "public/public-release.json" });
fs.writeFileSync(path.join(root, "overlay-files.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ releaseId, sourceCommit, bookingClient, bookingServer, mapClient, mapServer, files: output.map((item) => item.path) }, null, 2));
