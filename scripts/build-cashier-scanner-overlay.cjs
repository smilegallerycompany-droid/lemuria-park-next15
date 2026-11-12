"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { Script } = require("node:vm");

const BASE = "sha256:52778df68759ef561bca82ffe80be37e242d5fc8765621d8c3cf2756c479b56b";
const ASSET = ".next/static/chunks/2284.7260e14aa576ea9f.js";
const hash = (body) => createHash("sha256").update(body).digest("hex");

function replaceOnce(source, old, replacement) {
  assert.equal(source.split(old).length - 1, 1, "Unexpected scanner bundle: " + old.slice(0, 75));
  return source.replace(old, replacement);
}

// The active image contains the full cashier UI. Apply this fix to its lazy
// scanner chunk, retaining the active ticket API and the older cached chunks.
function patchScanner(source) {
  source = replaceOnce(source, 'S=(0,a.useRef)(null),C=', 'S=(0,a.useRef)(null),cameraRequest=(0,a.useRef)(0),[readyStream,setReadyStream]=(0,a.useState)(null),C=');
  source = replaceOnce(source, 'var e;null==(e=S.current)||e.getTracks()', 'var e;cameraRequest.current++,setReadyStream(null),null==(e=S.current)||e.getTracks()');
  source = replaceOnce(source, 'U(),t("camera");try{let e=await navigator.mediaDevices.getUserMedia',
    'U();const request=cameraRequest.current;t("camera");try{let e=await navigator.mediaDevices.getUserMedia');
  source = replaceOnce(source, 'S.current=e;let t=j.current;t&&(t.srcObject=e,await t.play());',
    'if(request!==cameraRequest.current){e.getTracks().forEach(track=>track.stop());return}S.current=e;setReadyStream(e);');
  source = replaceOnce(source, 'catch(n){let e=n instanceof DOMException', 'catch(n){if(request!==cameraRequest.current)return;let e=n instanceof DOMException');
  source = replaceOnce(source, 'C.current=!0,u(null);try{let e=await (0,s.T7)(n);T.current=n,D.current=Date.now(),h(e)',
    'C.current=!0,T.current=n,D.current=Date.now(),u(null);try{let e=await (0,s.T7)(n);h(e)');
  const start = 'if("camera"!==e)return;let t=!1,r=0,a=null,i=globalThis.BarcodeDetector;';
  const end = '},[e,O]),"result"===e&&d)';
  const before = source.indexOf(start), after = source.indexOf(end);
  assert.ok(before >= 0 && after > before && source.indexOf(start, before + 1) < 0);
  const recognition = `
    const video=j.current;
    if("camera"!==e||!readyStream||!video)return;
    video.srcObject=readyStream;
    let cancelled=false, frame=0, fallback=null;
    const active=()=>!cancelled&&S.current===readyStream;
    async function nativeLoop(detector){
      if(!active())return;
      if(video.readyState>=2&&!C.current){
        try{
          const codes=await detector.detect(video);
          const code=codes[0]?.rawValue?.trim();
          if(code&&active())await O(code);
        }catch{}
      }
      if(active())frame=requestAnimationFrame(()=>void nativeLoop(detector));
    }
    async function startRecognition(){
      try{await video.play()}catch{
        if(active())u("Не удалось запустить видео. Используйте ручной ввод.");
        return;
      }
      if(!active())return;
      try{
        const Detector=globalThis.BarcodeDetector;
        const detector=Detector&&new Detector({formats:["qr_code"]});
        if(detector){
          frame=requestAnimationFrame(()=>void nativeLoop(detector));
          return;
        }
      }catch{}
      try{
        const {BrowserMultiFormatReader}=await n.e(4895).then(n.bind(n,64895));
        if(!active())return;
        const reader=new BrowserMultiFormatReader();
        const controls=await reader.decodeFromVideoElement(video,result=>{
          const code=result?.getText()?.trim();
          if(code&&active())void O(code);
        });
        if(active())fallback=controls;else controls.stop();
      }catch{
        if(active())u("Не удалось запустить распознавание QR. Используйте ручной ввод.");
      }
    }
    void startRecognition();
    return()=>{cancelled=true;cancelAnimationFrame(frame);fallback?.stop()};
  `;
  return source.slice(0, before) + recognition + '},[e,O,readyStream]),"result"===e&&d)' + source.slice(after + end.length);
}

function build(root, commit) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  const previous = JSON.parse(fs.readFileSync(path.join(root, "public/live-seats-release.json"), "utf8"));
  assert.equal(previous.releaseId, "live-seats-20261112-53245e04");
  const original = fs.readFileSync(path.join(root, ASSET), "utf8");
  const patched = patchScanner(original);
  const oldHash = "7260e14aa576ea9f";
  const newHash = hash(patched).slice(0, oldHash.length);
  const asset = ASSET.replace(oldHash, newHash);
  const updates = new Map([[asset, patched]]);
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|json|html|rsc|meta|txt)$/.test(file) && file !== ASSET) {
        const body = fs.readFileSync(path.join(root, file), "utf8");
        if (body.includes(oldHash)) updates.set(file, body.replaceAll(oldHash, newHash));
      }
    }
  }
  walk(".next");
  const assets = [...updates.keys()].filter((file) => file.startsWith(".next/static/"));
  // The lazy chunk filename is also embedded in the webpack runtime. Give
  // the modified runtime its own hash so existing cached runtimes still work.
  for (const file of assets) {
    if (file === asset) continue;
    const match = file.match(/([a-f0-9]{16,32})\.js$/);
    assert.ok(match, "Static runtime filename must be hashed");
    const nextHash = hash(updates.get(file)).slice(0, match[1].length);
    updates.set(file.replace(match[1], nextHash), updates.get(file));
    updates.delete(file);
    function updateReferences(dir) {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const relative = path.join(dir, entry.name);
        if (entry.isDirectory()) updateReferences(relative);
        else if (!relative.startsWith(".next/static/") && /\.(js|json|html|rsc|meta|txt)$/.test(relative)) {
          const body = updates.get(relative) ?? fs.readFileSync(path.join(root, relative), "utf8");
          if (body.includes(match[1])) updates.set(relative, body.replaceAll(match[1], nextHash));
        }
      }
    }
    updateReferences(".next");
  }
  assert.ok(updates.size > 2, "Scanner asset must be referenced in the bundle");
  assert.ok([...updates.values()].some((body) => body.includes(path.basename(asset))));
  const output = [];
  for (const [file, body] of updates) {
    if (file.endsWith(".js")) new Script(body, { filename: file });
    if (file.endsWith(".json")) JSON.parse(body);
    output.push({ path: file, sha256: hash(body) });
  }
  for (const [file, body] of updates) fs.writeFileSync(path.join(root, file), body);
  const manifest = { releaseId: "cashier-scanner-20261112-" + commit.slice(0, 8), sourceCommit: commit,
    baseImageDigest: BASE, counts: { scanner: 1 }, scannerAsset: asset, files: output };
  fs.writeFileSync(path.join(root, "public/cashier-scanner-release.json"), JSON.stringify(manifest) + "\n");
  return manifest;
}

module.exports = { BASE, patchScanner, build };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]), process.argv[3])));
