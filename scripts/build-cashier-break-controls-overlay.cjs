"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { CashierBreakControls } = require("./cashier-break-controls-view.cjs");

const BASE = "sha256:4744055d09d0de80304fb7531d7a881b8162658a409fc0a772aab4dda654c207";
const PREVIOUS = "4ee081c268b13c0913c31671bc9e3307385a68a5";
const checksum = (s) => createHash("sha256").update(s).digest("hex");

const controls = 'require("/app/cashier-break-controls.cjs")';

function replaceOnce(body, before, after) {
  assert.equal(body.split(before).length - 1, 1, "Expected one match for " + before);
  return body.replace(before, () => after);
}

function patchView(body) {
  body = replaceOnce(body, "function StandaloneExtras(", CashierBreakControls.toString() + ";function StandaloneExtras(");
  const banner = 'W?.location?.city==="Саратов"?(0,s.jsx)("p",{className:"booking-hint",role:"note"';
  return replaceOnce(body, banner,
    '$?.cashierBreaks?(0,s.jsx)(CashierBreakControls,{React:a,jsx:s,controls:$.cashierBreaks,shiftId:W.id,refresh:eQ},W.id):' + banner);
}

function patchServer(files, changed) {
  const patch = (relative, callback) => {
    const name = ".next/server/" + relative;
    changed.set(name, callback(files.get(name)));
  };

  patch("chunks/9250.js", (body) => replaceOnce(body,
    'l.b.listCandidates(d.z,{locationId:k.id,park:t,statuses:["SCHEDULED","OPEN"],...w})',
    'l.b.listCandidates(d.z,{locationId:k.id,park:t,statuses:["SCHEDULED","OPEN"],...w,cashierBreaks:!0})'));
  patch("chunks/670.js", (body) => replaceOnce(body,
    '.then(rows=>require("/app/session-break-policy.cjs").filterCandidates(a,b,rows))',
    '.then(rows=>(b.cashierBreaks?' + controls +
      ':require("/app/session-break-policy.cjs")).filterCandidates(a,b,rows))'));
  patch("chunks/692.js", (body) => {
    body = replaceOnce(body, 'l.b.findByPublicId(a,c)', controls + '.findForCashier(a,c,g)');
    return replaceOnce(body, 'l.b.findByPublicId(a,b.secondarySessionPublicId)',
      controls + '.findForCashier(a,b.secondarySessionPublicId)');
  });
  patch("app/api/cashier/sessions/route.js", (body) => replaceOnce(body,
    'return(0,v.kU)({...h,partner:j?',
    'return(0,v.kU)({...h,cashierBreaks:await ' + controls + '.forShift(w.z,f,h.location.id),partner:j?'));
  patch("app/api/cashier/shift/entries/route.js", (body) => replaceOnce(body,
    'return(0,w.kU)({entry:await H(b.id,c)},201)',
    'if(c?.action==="setCashierBreak")return(0,w.kU)({cashierBreaks:await ' + controls +
      '.setOverride(z.z,b.id,c,{ErrorType:E.J,lockActor:G.aF,lockShift:G.VN,assertScope:F.Q})});return(0,w.kU)({entry:await H(b.id,c)},201)'));
}

function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/cashier-extras-quantity-release.json")));
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
  changed.set("cashier-break-controls.cjs", fs.readFileSync(path.join(__dirname, "cashier-break-controls.cjs"), "utf8"));
  const output = [];
  for (const [relative, body] of changed) {
    if (/\.[c]?js$/.test(relative)) new Script(body, { filename: relative });
    if (relative.endsWith(".json")) JSON.parse(body);
    fs.writeFileSync(path.join(root, relative), body);
    output.push({ path: relative, sha256: checksum(body) });
  }
  const result = {
    releaseId: "cashier-breaks-" + commit.slice(0, 8),
    sourceCommit: commit, baseImageDigest: BASE, previousRelease: previous.releaseId,
    asset, files: output,
  };
  fs.writeFileSync(path.join(root, "public/cashier-break-controls-release.json"), JSON.stringify(result) + "\n");
  return result;
}

module.exports = { BASE, build, patchServer, patchView };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
