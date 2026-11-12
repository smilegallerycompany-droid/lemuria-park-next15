"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { patchScanner } = require("./build-cashier-scanner-overlay.cjs");

const fixture = process.env.SCANNER_BASE_ASSET;
assert.ok(fixture, "Set SCANNER_BASE_ASSET to the pinned production scanner chunk");
const chunk = patchScanner(fs.readFileSync(fixture, "utf8"));
const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  let cursor = 0;
  let mediaReady;
  let videoReady;
  let onDecode;
  let decodeCount = 0;
  let stopped = 0;
  let checkIns = 0;
  const hooks = [];
  const pending = [];
  const stream = { getTracks: () => [{ stop: () => stopped++ }], getVideoTracks: () => [] };
  const video = { srcObject: null, play: () => new Promise((resolve) => { videoReady = resolve; }) };
  const sameDeps = (before, after) => before && before.length === after.length &&
    before.every((value, index) => value === after[index]);
  const react = {
    useState(initial) {
      const index = cursor++;
      hooks[index] ??= { value: initial };
      return [hooks[index].value, (value) => {
        hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(hooks[index]?.deps, deps)) hooks[index] = { value: callback, deps };
      return hooks[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const old = hooks[index];
      if (!sameDeps(old?.deps, deps)) pending.push(() => {
        old?.dispose?.();
        hooks[index] = { deps, dispose: callback() };
      });
    },
  };
  const jsx = (tag, props) => {
    if (tag === "video") props.ref.current = video;
    return { tag, props };
  };
  const noop = () => {};
  const surface = { addEventListener: noop, removeEventListener: noop };
  const context = vm.createContext({
    self: {}, window: { ...surface, isSecureContext: true }, document: surface,
    location: { hostname: "staging" }, navigator: { onLine: true, mediaDevices: {
      getUserMedia: () => new Promise((resolve) => { mediaReady = resolve; }),
    } },
    localStorage: { getItem: () => '{"scanSound":false,"scanVibrate":false,"preferredCamera":"environment"}' },
    cancelAnimationFrame: noop, requestAnimationFrame: () => 1, DOMException,
  });
  vm.runInContext(chunk, context);
  const modules = context.self.webpackChunk_N_E[0][1];
  const exports = {};
  const requireModule = (id) => ({
    95155: { jsx, jsxs: jsx }, 12115: react, 89678: { E6: Error },
    15610: { T7: async (code) => {
      assert.equal(code, "synthetic-qr");
      checkIns++;
      return { result: "SUCCESS", message: "fixture" };
    } },
    64895: { BrowserMultiFormatReader: class {
      async decodeFromVideoElement(element, callback) {
        assert.equal(element, video);
        assert.equal(video.srcObject, stream);
        decodeCount++;
        onDecode = callback;
        return { stop: noop };
      }
    } },
  })[id];
  requireModule.r = noop;
  requireModule.d = (_, bindings) => { exports.scan = bindings.QrScanner; };
  requireModule.e = async () => {};
  modules[12284]({}, {}, requireModule);

  function render() {
    cursor = 0;
    const tree = exports.scan()();
    for (const effect of pending.splice(0)) effect();
    return tree;
  }

  function click(node, label) {
    if (Array.isArray(node)) return node.some((child) => click(child, label));
    if (node?.tag === "button" && node.props.children === label) {
      node.props.onClick();
      return true;
    }
    return node?.props ? click(node.props.children, label) : false;
  }

  return { render, click, allow: () => mediaReady(stream), play: () => videoReady(),
    decode: () => onDecode({ getText: () => "synthetic-qr" }), counts: () => [decodeCount, stopped, checkIns] };
}

test("fallback begins only after delayed camera permission and playback", async () => {
  const h = harness();
  assert.ok(h.click(h.render(), "Включить камеру"));
  h.render();
  assert.deepEqual(h.counts(), [0, 0, 0]);
  h.allow();
  await settle();
  h.render();
  assert.deepEqual(h.counts(), [0, 0, 0]);
  h.play();
  await settle();
  assert.deepEqual(h.counts(), [1, 0, 0]);
  h.decode();
  await settle();
  assert.deepEqual(h.counts(), [1, 1, 1]);
});

test("closing before permission resolves stops the late stream", async () => {
  const h = harness();
  assert.ok(h.click(h.render(), "Включить камеру"));
  assert.ok(h.click(h.render(), "Закрыть"));
  h.render();
  h.allow();
  await settle();
  h.render();
  assert.deepEqual(h.counts(), [0, 1, 0]);
});
