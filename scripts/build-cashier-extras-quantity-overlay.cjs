"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { StandaloneExtras } = require("./cashier-standalone-extras-view.cjs");

const BASE = "sha256:c77a8c20097fc2977097950c75953ad755eb4770a2d55475670032f1ee130208";
const PREVIOUS = "49695d2f9ed8bb3e62f5725d395e36a29b80d74c";
const checksum = (s) => createHash("sha256").update(s).digest("hex");

function patchView(body) {
  const start = "function StandaloneExtras(";
  const end = ";function U(){var";
  assert.equal(body.split(start).length - 1, 1);
  const index = body.indexOf(start);
  const boundary = body.indexOf(end, index);
  assert.ok(boundary > index);
  assert.ok(body.slice(index, boundary).includes('type: "number", min: 1, max: 100'));
  return body.slice(0, index) + StandaloneExtras.toString() + body.slice(boundary);
}

function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/cashier-standalone-extras-release.json")));
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
  const output = [];
  for (const [relative, body] of changed) {
    if (relative.endsWith(".js")) new Script(body, { filename: relative });
    if (relative.endsWith(".json")) JSON.parse(body);
    fs.writeFileSync(path.join(root, relative), body);
    output.push({ path: relative, sha256: checksum(body) });
  }
  const result = {
    releaseId: "cashier-extras-quantity-" + commit.slice(0, 8),
    sourceCommit: commit, baseImageDigest: BASE, previousRelease: previous.releaseId,
    asset, files: output,
  };
  fs.writeFileSync(path.join(root, "public/cashier-extras-quantity-release.json"), JSON.stringify(result) + "\n");
  return result;
}

module.exports = { BASE, build, patchView };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
