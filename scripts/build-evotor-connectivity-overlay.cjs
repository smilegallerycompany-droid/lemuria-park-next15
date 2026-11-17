"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { path: endpoint } = require("./evotor-connectivity.cjs");

const health = "/api/health/live";

function replaceOnce(body, before, after) {
  assert.equal(body.split(before).length - 1, 1, before);
  return body.replace(before, () => after);
}

function build(root) {
  const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
  const folder = ".next/server/app" + endpoint;
  const entry = endpoint + "/route";
  const healthyFolder = ".next/server/app" + health;
  let route = read(healthyFolder + "/route.js");
  route = replaceOnce(route, "a.id=9437,a.ids=[9437]", "a.id=99580001,a.ids=[99580001]");
  route = replaceOnce(route, "94303:(a,b,c)", "99580002:(a,b,c)");
  route = replaceOnce(route, "b(b.s=94303)", "b(b.s=99580002)");
  route = replaceOnce(route, 'require("../../../../webpack-runtime.js")',
    'require("../../../../../webpack-runtime.js")');
  route = replaceOnce(route, "c.d(d,{GET:()=>x})",
    'c.d(d,{GET:()=>evotorConnectivity,POST:()=>evotorConnectivity});' +
    'function evotorConnectivity(request){return require("/app/evotor-connectivity.cjs").handle(request)}');
  route = route.replaceAll(health, endpoint);
  new Script(route, { filename: folder + "/route.js" });
  const files = new Map([
    [folder + "/route.js", route],
    [folder + "/route_client-reference-manifest.js",
      read(healthyFolder + "/route_client-reference-manifest.js").replaceAll(health, endpoint)],
    ["evotor-connectivity.cjs", fs.readFileSync(path.join(__dirname, "evotor-connectivity.cjs"), "utf8")],
  ]);
  for (const [name, value] of [
    [".next/server/app-paths-manifest.json", "app" + entry + ".js"],
    [".next/app-path-routes-manifest.json", endpoint],
  ]) {
    const manifest = JSON.parse(read(name));
    assert.ok(Object.hasOwn(manifest, health + "/route"));
    assert.ok(!Object.hasOwn(manifest, entry), "A checkout route already exists");
    manifest[entry] = value;
    files.set(name, JSON.stringify(manifest, null, 2) + "\n");
  }
  for (const [name, body] of files) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return [...files.keys()];
}

if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]))));
