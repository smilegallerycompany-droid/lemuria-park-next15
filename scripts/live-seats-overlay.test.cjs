"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const { watchSeats, scrollToStep } = require("./build-live-seats-overlay.cjs");

test("polls a visible screen, avoids overlaps, and cancels when unmounted", async () => {
  const events = new Map();
  const doc = { visibilityState: "visible", addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name) };
  const win = {
    setInterval: (fn, ms) => { assert.equal(ms, 15000); events.set("interval", fn); return 1; },
    clearInterval: (id) => { assert.equal(id, 1); events.delete("interval"); },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const watch = vm.runInNewContext(`(${watchSeats})`, { document: doc, window: win, AbortController });
  const signals = [];
  let settle;
  const stop = watch((signal) => {
    signals.push(signal);
    return new Promise((resolve) => { settle = resolve; });
  });
  doc.visibilityState = "hidden";
  await events.get("interval")();
  assert.equal(signals.length, 0);
  doc.visibilityState = "visible";
  const first = events.get("visibilitychange")();
  await events.get("focus")();
  assert.equal(signals.length, 1);
  settle();
  await first;
  const resumed = events.get("pageshow")();
  assert.equal(signals.length, 2);
  stop();
  assert.ok(signals[1].aborted);
  assert.equal(events.size, 0);
  settle();
  await resumed;
});

test("both cashier steps focus the destination and scroll without triggering payment", () => {
  const actions = [];
  const scroll = vm.runInNewContext(`(${scrollToStep})`, {
    document: { getElementById: (id) => ({
      focus: (opts) => actions.push([id, "focus", opts.preventScroll]),
      scrollIntoView: (opts) => actions.push([id, "scroll", opts.behavior, opts.block]),
    }) },
    window: { matchMedia: () => ({ matches: true }) },
  });
  for (const id of ["cashier-extras-step", "cashier-payment-step"]) scroll(id);
  assert.deepEqual(actions, [
    ["cashier-extras-step", "focus", true],
    ["cashier-extras-step", "scroll", "auto", "start"],
    ["cashier-payment-step", "focus", true],
    ["cashier-payment-step", "scroll", "auto", "start"],
  ]);
});
