#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { Script } = require("node:vm");

const BASE = "sha256:63b3b8ea263194f4c38843ab37bfbbe154e8fbc35361bb8ffee8922a9fa6ae7c";
const digest = (body) => createHash("sha256").update(body).digest("hex");

function replaceOnce(body, pattern, replacement) {
  const matches = typeof pattern === "string" ? body.split(pattern).length - 1
    : [...body.matchAll(new RegExp(pattern.source, pattern.flags + (pattern.global ? "" : "g")))].length;
  assert.equal(matches, 1, "Expected one match for " + String(pattern).slice(0, 130));
  return body.replace(pattern, replacement);
}

function watchSeats(refresh) {
  const controller = new AbortController();
  let running = false;
  const update = async () => {
    if (running || controller.signal.aborted || document.visibilityState === "hidden") return;
    running = true;
    try {
      await refresh(controller.signal);
    } catch {
      // Keep the last successful response. The next refresh retries.
    } finally {
      running = false;
    }
  };
  const timer = window.setInterval(update, 15000);
  window.addEventListener("focus", update);
  window.addEventListener("pageshow", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    controller.abort();
    window.clearInterval(timer);
    window.removeEventListener("focus", update);
    window.removeEventListener("pageshow", update);
    document.removeEventListener("visibilitychange", update);
  };
}

function scrollToStep(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

function patchBooking(body) {
  const initial = '(0,f.useEffect)(()=>{J&&(null==Y?void 0:Y.location)&&ey(J,Y.location.slug)},[J,Y,ey]);';
  body = replaceOnce(body, initial, initial + `let seatLocation=Y?.location?.slug,seatRefresh=(0,f.useCallback)(async(signal)=>{if(!J||!seatLocation||K||signal?.aborted)return;let version=eh.current;try{let result=await (0,g.jo)({date:J,locationSlug:seatLocation},{signal});if(version===eh.current&&!signal?.aborted)F(result.sessions)}catch{}},[J,seatLocation,K]);(0,f.useEffect)(()=>J&&seatLocation&&!K?(${watchSeats})(seatRefresh):void 0,[J,seatLocation,K,seatRefresh]);`);
  body = replaceOnce(body, 'if(0===eb.length)return void ee("");eb.some(e=>e.publicId===X)||ee(eb[0].publicId)', 'if(!X&&eb.length)ee(eb[0].publicId)');
  body = replaceOnce(body, 'G(e instanceof v.E6?e.message:"Не удалось зарезервировать места"),es(!1),ec.current=!1',
    'G(e instanceof v.E6?e.message:"Не удалось зарезервировать места"),es(!1),ec.current=!1,void seatRefresh()');
  return body;
}

function patchCashier(body) {
  const loader = /let eQ=\(0,a\.useCallback\)\(async\(\)=>\{let e=\+\+ed\.current;.*?\},\[\]\),eJ=/;
  body = replaceOnce(body, loader,
    `let seatForeground=(0,a.useRef)(0),eQ=(0,a.useCallback)(async(signal)=>{let background=!!signal;if(background&&seatForeground.current)return;let version=++ed.current;if(!background){seatForeground.current=version;eL(!0),em(null)}try{let data=await (0,A.pI)({signal});if(version!==ed.current||signal?.aborted)return;let partners=data.partner?.sessions??[];es(previous=>JSON.stringify(previous)===JSON.stringify(partners)?previous:partners);ee(previous=>{if(!previous)return data;let share=(before,after)=>JSON.stringify(before)===JSON.stringify(after)?before:after;let priorSessions=new Map(previous.sessions.map(session=>[session.publicId,session]));return share(previous,{...data,ticketTypes:share(previous.ticketTypes,data.ticketTypes),extras:share(previous.extras,data.extras),sessions:data.sessions.map(session=>share(priorSessions.get(session.publicId),session))})});eh(selected=>selected??data.sessions.find(session=>Date.parse(session.startsAt)>Date.now()&&O(session,data.ticketTypes))?.publicId??null)}catch(error){if(!background&&version===ed.current)em(error instanceof T.E6?error.message:"Не удалось загрузить сеансы")}finally{if(!background&&seatForeground.current===version){seatForeground.current=0;eL(!1)}}},[]),eJ=`);
  const initial = '(0,a.useEffect)(()=>{B&&W&&(async()=>{await eQ(),await eJ()})()},[B,W,eQ,eJ]);';
  body = replaceOnce(body, initial, initial + `(0,a.useEffect)(()=>B&&W?(${watchSeats})(eQ):void 0,[B,W,eQ]);`);
  body = replaceOnce(body, 'let eY=null!=(n=null==$?void 0:$.sessions.find(e=>e.publicId===ex))?n:null,',
    'let seatSessions=($?.sessions??[]).filter(session=>Date.parse(session.startsAt)>Date.now()),eY=seatSessions.find(session=>session.publicId===ex)??null,');
  body = replaceOnce(body, '(null==$?void 0:$.sessions.length)?', 'seatSessions.length?');
  body = replaceOnce(body, 'null==$?void 0:$.sessions.map(e=>', 'seatSessions.map(e=>');
  body = replaceOnce(body, 'let e3=', 'let seatPartnerAvailable=!eX||en.some(session=>session.publicId===ea&&!session.soldOut&&Date.parse(session.startsAt)>Date.now());let e3=seatPartnerAvailable&&');
  body = replaceOnce(body, 'en.filter(e=>!e.soldOut)', 'en.filter(e=>!e.soldOut&&Date.parse(e.startsAt)>Date.now())');
  body = replaceOnce(body, 'eh(e.publicId),ef({}),eE(null);', 'eh(e.publicId),ef({}),er({}),el(""),eE(null);');
  body = replaceOnce(body, 'children:"Выберите сеанс слева."', 'children:ex?"Продажа на выбранный сеанс закрыта. Выберите другой сеанс.":"Выберите сеанс для продажи."');
  body = replaceOnce(body, 'let seatPartnerAvailable=', '(0,a.useEffect)(()=>{if(!eW.current&&(!eY||(eX&&!en.some(session=>session.publicId===ea&&!session.soldOut&&Date.parse(session.startsAt)>Date.now()))))e_(null)},[eY,eX,en,ea]);let seatPartnerAvailable=');
  body = replaceOnce(body, 'id:"cashier-payment-step",className:"mt-4 rounded-2xl bg-cream p-4"',
    'className:"mt-4 rounded-2xl bg-cream p-4"');
  body = replaceOnce(body, 'children:"3. Оплата и сохранение"', 'children:"Итого"');
  body = replaceOnce(body, /className:"mt-4 grid gap-3",children:\[\(0,([\w$]+)\.jsx\)\("p",\{className:"cashier-save-hint"/,
    'id:"cashier-payment-step",tabIndex:-1,style:{scrollMarginTop:96},className:"mt-4 grid gap-3",children:[(0,$1.jsx)("h4",{className:"font-bold",children:"3. Способ оплаты"}),(0,$1.jsx)("p",{className:"cashier-save-hint"');
  body = replaceOnce(body, 'id:"cashier-extras-step",className:', 'id:"cashier-extras-step",tabIndex:-1,style:{scrollMarginTop:96},className:');
  for (const id of ["cashier-extras-step", "cashier-payment-step"]) {
    body = replaceOnce(body, `onClick:()=>{document.getElementById("${id}")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})}`,
      `onClick:()=>(${scrollToStep})("${id}")`);
  }
  return replaceOnce(body, 'eT?"Оформление…":"Карта"]', 'eT?"Оформление…":"Безнал (карта)"]');
}

function build(root, commit) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/privacy-release.json"), "utf8"));
  assert.equal(previous.releaseId, "cookie-consent-20261110-9d6ac98e");
  const originals = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|json|css|html|rsc|meta|txt)$/.test(file)) {
        originals.set(file, fs.readFileSync(path.join(root, file), "utf8"));
      }
    }
  }
  walk(".next");
  const files = new Map(originals);
  const counts = { booking: 0, cashier: 0 };
  for (const [file, body] of originals) {
    if (!file.endsWith(".js")) continue;
    // A previous revision's assets are retained in the image for open tabs.
    // Patch the live booking module and all matching cashier representations.
    if (file === ".next/static/chunks/4267-7d018e29108008af.js") {
      files.set(file, patchBooking(body));
      counts.booking++;
    }
    if (body.includes('id:"cashier-extras-step"') && body.includes('onClick:()=>e_("CASH")')) {
      files.set(file, patchCashier(body));
      counts.cashier++;
    }
  }
  assert.equal(counts.booking, 1);
  assert.ok(counts.cashier >= 2);
  for (let pass = 0; ; pass++) {
    const renames = new Map();
    for (const [file, body] of files) {
      if (!file.startsWith(".next/static/") || originals.get(file) === body) continue;
      const old = file.match(/(?:-|\/)([0-9a-f]{16,32})\.(?:js|css)$/)?.[1];
      if (!old) continue;
      const next = digest(body).slice(0, old.length);
      if (old === next) continue;
      renames.set(old, next);
      files.set(file.replace(old, next), body);
      files.delete(file);
    }
    if (renames.size === 0) break;
    assert.ok(pass < 12, "Static reference convergence");
    for (const [file, body] of files) {
      let nextBody = body;
      for (const [from, to] of renames) nextBody = nextBody.replaceAll(from, to);
      files.set(file, nextBody);
    }
  }
  const output = [];
  for (const [file, body] of files) {
    if (originals.get(file) === body) continue;
    if (file.endsWith(".js")) new Script(body, { filename: file });
    if (file.endsWith(".json")) JSON.parse(body);
    output.push({ path: file, sha256: digest(body) });
  }
  const releaseId = "live-seats-20261112-" + commit.slice(0, 8);
  const manifest = { releaseId, sourceCommit: commit, baseImageDigest: BASE, counts, files: output };
  for (const { path: file } of output) fs.writeFileSync(path.join(root, file), files.get(file));
  fs.writeFileSync(path.join(root, "public/live-seats-release.json"), JSON.stringify(manifest) + "\n");
  return manifest;
}

module.exports = { BASE, build, patchBooking, patchCashier, watchSeats, scrollToStep };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
