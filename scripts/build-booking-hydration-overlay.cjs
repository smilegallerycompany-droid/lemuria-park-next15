"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { Script } = require("node:vm");

const hash = text => createHash("sha256").update(text).digest("hex");
const before = "Всем комфортно смотреть программу и фотографировать.";
const after = "Всем комфортно смотреть программу.";
const base = "d7aefcc8dc00ef64f0f6a7ae79a73b79e7946fe5";

function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const read = name => fs.readFileSync(path.join(root, name), "utf8");
  assert.equal(JSON.parse(read("public/cashier-seat-reserve-release.json")).sourceCommit, base);
  const manifest = JSON.parse(read(".next/app-build-manifest.json"));
  const oldName = manifest.pages["/(public)/page"].at(-1);
  assert.equal(oldName, "static/chunks/app/(public)/page-0dbc6768a7017d54.js");
  const body = read(".next/" + oldName);
  assert.equal(body.split(before).length, 2);
  const updated = body.replace(before, after);
  const oldHash = "0dbc6768a7017d54";
  const newHash = hash(updated).slice(0, 16);
  const asset = ".next/" + oldName.replace(oldHash, newHash);
  const changes = new Map([[asset, updated]]);
  function visit(dir) {
    for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.posix.join(dir, item.name);
      if (item.isDirectory()) { visit(file); continue; }
      if (!/\.(js|json|html|rsc|meta|txt)$/.test(file) || file === ".next/" + oldName) continue;
      const original = read(file);
      if (!original.includes(oldHash)) continue;
      assert.ok(!file.startsWith(".next/static/"), "Unexpected static dependency: " + file);
      changes.set(file, original.replaceAll(oldHash, newHash));
    }
  }
  visit(".next");
  assert.ok(changes.has(".next/app-build-manifest.json"));
  assert.ok([...changes.keys()].some(file => file.includes("client-reference-manifest")));
  const files = [];
  for (const [name, text] of changes) {
    if (name.endsWith(".js")) new Script(text);
    if (name.endsWith(".json")) JSON.parse(text);
    files.push({path: name, sha256: hash(text)});
  }
  for (const [name, text] of changes) fs.writeFileSync(path.join(root, name), text);
  return {sourceCommit: commit, previousSourceCommit: base, asset, files};
}
module.exports = { build };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
