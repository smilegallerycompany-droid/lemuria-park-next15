"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const { patchOverview } = require("./build-crm-timezone-overlay.cjs");

test("patch refuses an unrelated or already-patched bundle", () => {
  assert.throws(() => patchOverview("unrelated"));
  const fixture = '"Смены сегодня";"Ближайшие сеансы";D.sessions.map(e=>(0,E.r6)(e.startsAt))';
  const patch = patchOverview(fixture);
  assert.ok(patch.body.includes("D.locations?.find"));
  assert.throws(() => patchOverview(patch.body));
  assert.throws(() => patchOverview(fixture + fixture));
});

test("actual live formatter renders each session in its location timezone", t => {
  const file = process.env.LEMURIA_LIVE_OVERVIEW_JS;
  if (!file) { t.skip("Set LEMURIA_LIVE_OVERVIEW_JS to the actual downloaded production chunk"); return; }
  const code = fs.readFileSync(file, "utf8");
  let modules;
  vm.runInNewContext(code, { self: { webpackChunk_N_E: { push: chunk => { modules = chunk[1]; } } } });
  const exports = {};
  const requireModule = () => { throw new Error("Unexpected formatter dependency"); };
  requireModule.d = (target, defs) => Object.keys(defs).forEach(k => Object.defineProperty(target, k, { get: defs[k] }));
  modules[16382]({}, exports, requireModule);
  const patch = patchOverview(code);
  const D = { timezone: "Europe/Moscow", locations: [
    { id: "saratov", timezone: "Europe/Saratov" }, { id: "volgograd", timezone: "Europe/Moscow" },
  ] };
  const display = e => vm.runInNewContext(patch.replacement, { D, e, E: exports });
  assert.match(display({ startsAt: "2026-11-07T06:30:00Z", location: { id: "saratov" } }), /10:30/);
  assert.match(display({ startsAt: "2026-11-07T07:30:00Z", location: { id: "volgograd" } }), /10:30/);
  assert.match(display({ startsAt: "2026-11-07T06:30:00Z", location: { id: "unknown" } }), /09:30/);
  assert.match(display({ startsAt: "2026-11-07T06:30:00Z", location: null }), /09:30/);
  assert.match(display({ startsAt: "2026-11-06T21:30:00Z", location: { id: "saratov" } }), /07\.11\.2026, 01:30/);
});
