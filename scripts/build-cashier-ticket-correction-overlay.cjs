"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { TicketCorrection } = require("./cashier-ticket-correction-view.cjs");

const BASE = "sha256:b15fe159978df8b0da624f28626d137353943812d44e9496701ea616764a873a";
const PREVIOUS = "d5d1b51e1615037f2f441808bb123a3c5a7dac05";
const checksum = (s) => createHash("sha256").update(s).digest("hex");

const correction = 'require("/app/cashier-ticket-correction.cjs")';

function replaceOnce(body, before, after) {
  assert.equal(body.split(before).length - 1, 1, "Expected one match for " + before);
  return body.replace(before, () => after);
}

function patchView(body) {
  const inject = 'function o(){var e,t;let[r,o]=(0,s.useState)("today")';
  body = replaceOnce(body, inject, TicketCorrection.toString() + ";" + inject);
  const anchor = 'id:"cashier-order-print",children:[';
  const component = '(0,a.jsx)(TicketCorrection,{React:s,jsx:a,order:x,refresh:e=>Promise.all([S(e),E()]),money:t=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB"}).format(t/100)},x.number),';
  return replaceOnce(body, anchor, anchor + component);
}

function patchRoute(body) {
  body = replaceOnce(body, 'c.d(d,{GET:()=>A})', 'c.d(d,{GET:()=>A,POST:()=>A})');
  body = replaceOnce(body, 'async function A(a,b){try{let a=await (0,x.Xf)(),{number:c}=await b.params,d=await w.z.order.findUnique',
    'async function A(request,b){try{let a=await (0,x.Xf)(),{number:g}=await b.params;' +
    'if(request.method==="POST"){(0,c(35991).t)(request);const j=await request.json().catch(()=>{throw new v.hD("VALIDATION_ERROR","Некорректный JSON",400)});' +
    'return(0,v.kU)(await ' + correction + '.exchange(w.z,{actor:a,number:g,body:j},{ApiError:v.hD,canAccess:y.Ax,resolvePrice:c(92633).y,assertScope:c(88120).Q,lockActor:c(77114).aF,lockShift:c(77114).VN}));}' +
    'let d=await w.z.order.findUnique');
  body = replaceOnce(body, 'order.findUnique({where:{number:c}', 'order.findUnique({where:{number:g}');
  body = replaceOnce(body, 'items:!0,extras:!0,session:{include:{location:!0}}', 'items:!0,extras:!0,shift:!0,refunds:{select:{id:!0},take:1},session:{include:{location:!0}}');
  body = replaceOnce(body, 'ticketTypeName:a.ticketType.name', 'ticketTypeName:a.ticketType.name,canCorrect:!1');
  // The GET handler's map variable shadows its authenticated cashier.
  const eligibility = 'canCorrectOrder=' + correction + '.eligibleOrder(d,a,!0);';
  body = replaceOnce(body, 'return(0,v.kU)({order:', 'const ' + eligibility + 'return(0,v.kU)({order:');
  body = replaceOnce(body, 'canCorrect:!1', 'canCorrect:canCorrectOrder&&a.sessionId===d.sessionId&&["ADULT","CHILD"].includes(a.ticketType.code)&&["VALID","USED"].includes(a.status)');
  return replaceOnce(body, 'b.X(0,[3897,2995,6802,1692,7028,6199]', 'b.X(0,[3897,2995,6802,1692,7028,6199,8555,7114,692]');
}

function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/cashier-break-controls-release.json")));
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
  const oldAsset = ".next/" + manifest.pages["/(cashier)/cashier/orders/page"].at(-1);
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
  const route = ".next/server/app/api/cashier/orders/[number]/route.js";
  changed.set(route, patchRoute(files.get(route)));
  changed.set("cashier-ticket-correction.cjs", fs.readFileSync(path.join(__dirname, "cashier-ticket-correction.cjs"), "utf8"));
  const output = [];
  for (const [relative, body] of changed) {
    if (/\.[c]?js$/.test(relative)) new Script(body, { filename: relative });
    if (relative.endsWith(".json")) JSON.parse(body);
    fs.writeFileSync(path.join(root, relative), body);
    output.push({ path: relative, sha256: checksum(body) });
  }
  const result = {
    releaseId: "cashier-ticket-correction-" + commit.slice(0, 8),
    sourceCommit: commit, baseImageDigest: BASE, previousRelease: previous.releaseId,
    asset, files: output,
  };
  fs.writeFileSync(path.join(root, "public/cashier-ticket-correction-release.json"), JSON.stringify(result) + "\n");
  return result;
}

module.exports = { BASE, build, patchRoute, patchView };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
