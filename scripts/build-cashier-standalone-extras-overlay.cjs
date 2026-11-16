"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { StandaloneExtras } = require("./cashier-standalone-extras-view.cjs");

const BASE = "sha256:c9d562672b4ec85ab07ad357f64584bf50ea547fb08f3704103edbfdf87ecd7b";
const ENTRY_ROUTE = ".next/server/app/api/cashier/shift/entries/route.js";
const POLICY = 'require("/app/cashier-standalone-extras.cjs")';
const hash = (body) => createHash("sha256").update(body).digest("hex");

function once(body, search, value) {
  assert.equal(body.split(search).length - 1, 1, "Expected one occurrence of " + search);
  return body.replace(search, () => value);
}

function patchEntryRoute(body) {
  body = once(body, "let c=D.sw.parse(b);", "let c=" + POLICY + ".parseEntry(b,value=>D.sw.parse(value));");
  body = once(body, "let g=(0,D.uC)(c);", "await " + POLICY + ".checkPrice(b,c,E.J);let g=(0,D.uC)(c);");
  const label = body.match(/parkOperationId:h\.id,comment:`\$\{([A-Z]\.oZ\[c\.kind\])\}/)?.[1];
  assert.ok(label, "Missing cash operation label");
  return once(body, label, '("PHOTO_SALE"===c.kind?"Продажа фото":' + label + ')');
}

function patchWorkspace(body) {
  const clock = '(0,s.jsxs)("div",{className:"cashier-home-clock no-print"';
  body = once(body, "function U(){var", StandaloneExtras.toString() + ";function U(){var");
  return once(body, clock, '(0,s.jsx)(StandaloneExtras,{React:a,jsx:s,products:$?.extras,shiftId:W.id,refreshShift:J},W.id),' + clock);
}

function patchFinancePolicy(body) {
  body = once(body, "entry.kind==='BALABAS_SALE'?entry.amountKopecks",
    "(entry.kind==='BALABAS_SALE'||require('./cashier-standalone-extras.cjs').isCashSale(entry))?entry.amountKopecks");
  body = once(body, "op.kind==='FEED_SALE'?'feed':'balabas'",
    "op.kind==='FEED_SALE'?'feed':op.kind==='PHOTO_SALE'?'photo':'balabas'");
  body = once(body, ";p.total+=op.amountKopecks;if(op.kind==='FEED_SALE')addBase(op.shiftId,op.amountKopecks);}",
    ";p.total+=op.amountKopecks;if(op.kind==='FEED_SALE'||op.kind==='PHOTO_SALE')addBase(op.shiftId,op.amountKopecks);}");
  assert.equal(body.split("['FEED_SALE','BALABAS_SALE']").length - 1, 2);
  return body.replaceAll("['FEED_SALE','BALABAS_SALE']", "['FEED_SALE','BALABAS_SALE','PHOTO_SALE']");
}

function walk(root, dir, files) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, relative, files);
    else if (/\.(js|json|html|rsc|meta|txt|css)$/.test(relative)) {
      files.set(relative, fs.readFileSync(path.join(root, relative), "utf8"));
    }
  }
}

function build(root, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/cashier-end-time-release.json")));
  assert.equal(previous.sourceCommit, "b17ef88c4fb46e4162bb5396b38fc7407e05e841");
  const originals = new Map();
  walk(root, ".next", originals);
  for (const file of ["finance-report-policy.cjs", "paper-daily-policy.cjs"]) {
    originals.set(file, fs.readFileSync(path.join(root, file), "utf8"));
  }
  const files = new Map(originals);
  const manifest = JSON.parse(files.get(".next/app-build-manifest.json"));
  const workspace = ".next/" + manifest.pages["/(cashier)/cashier/page"].at(-1);
  files.set(workspace, patchWorkspace(files.get(workspace)));
  files.set(ENTRY_ROUTE, patchEntryRoute(files.get(ENTRY_ROUTE)));
  files.set("finance-report-policy.cjs", patchFinancePolicy(files.get("finance-report-policy.cjs")));
  files.set("paper-daily-policy.cjs", once(files.get("paper-daily-policy.cjs"),
    "['STAFF','FEED_SALE','BALABAS_SALE']", "['STAFF','FEED_SALE','BALABAS_SALE','PHOTO_SALE']"));
  files.set("cashier-standalone-extras.cjs", fs.readFileSync(path.join(__dirname, "cashier-standalone-extras.cjs"), "utf8"));

  let shiftTotals = 0;
  let directorTotals = 0;
  for (const [file, existing] of files) {
    if (!file.endsWith(".js")) continue;
    let body = existing;
    if (file.startsWith(".next/server/")) {
      const shiftPattern = '["FEED_SALE","BALABAS_SALE"].includes(m.kind)';
      if (body.includes(shiftPattern)) {
        body = once(body, shiftPattern, '["FEED_SALE","BALABAS_SALE","PHOTO_SALE"].includes(m.kind)');
        shiftTotals++;
      }
      const directorPattern = 'u["FEED_SALE"===a.kind?"feed":"balabas"]';
      if (body.includes(directorPattern)) {
        body = once(body, 'kind:{in:["FEED_SALE","BALABAS_SALE"]}',
          'kind:{in:["FEED_SALE","BALABAS_SALE","PHOTO_SALE"]}');
        body = once(body, directorPattern, 'u["FEED_SALE"===a.kind?"feed":"PHOTO_SALE"===a.kind?"photo":"balabas"]');
        directorTotals++;
      }
    }
    body = body.replaceAll(/FEED_SALE:"Продажа корма",(?!PHOTO_SALE:)/g,
      'FEED_SALE:"Продажа корма",PHOTO_SALE:"Продажа фото",');
    files.set(file, body);
  }
  assert.ok(shiftTotals > 0 && directorTotals > 0, JSON.stringify({ shiftTotals, directorTotals }));

  for (let pass = 0; ; pass++) {
    const renames = new Map();
    for (const [file, body] of files) {
      if (!file.startsWith(".next/static/") || originals.get(file) === body) continue;
      const old = file.match(/[.-]([a-f0-9]{16,32})\.(?:js|css)$/)?.[1];
      assert.ok(old, "Unexpected static filename: " + file);
      const next = hash(body).slice(0, old.length);
      if (old === next) continue;
      renames.set(old, next);
      files.delete(file);
      files.set(file.replace(old, next), body);
    }
    if (!renames.size) break;
    assert.ok(pass < 12, "Static references did not converge");
    for (const [file, body] of files) {
      let updated = body;
      for (const [old, next] of renames) updated = updated.replaceAll(old, next);
      files.set(file, updated);
    }
  }

  const changed = [];
  for (const [file, body] of files) {
    if (originals.get(file) === body) continue;
    if (/\.(?:js|cjs)$/.test(file)) new Script(body, { filename: file });
    if (file.endsWith(".json")) JSON.parse(body);
    changed.push({ path: file, sha256: hash(body) });
  }
  for (const { path: file } of changed) fs.writeFileSync(path.join(root, file), files.get(file));
  const result = {
    releaseId: "cashier-standalone-extras-" + commit.slice(0, 8),
    sourceCommit: commit,
    baseImageDigest: BASE,
    previousRelease: previous.releaseId,
    files: changed,
    counts: { shiftTotals, directorTotals },
  };
  fs.writeFileSync(path.join(root, "public/cashier-standalone-extras-release.json"), JSON.stringify(result) + "\n");
  return result;
}

module.exports = { BASE, build, patchEntryRoute, patchFinancePolicy, patchWorkspace };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
