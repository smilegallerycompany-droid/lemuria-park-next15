"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const { patchOverview, patchSessions, patchOverviewShift } = require("./build-crm-timezone-overlay.cjs");

test("actual sessions table passes its API location timezone, leaving reconciliation unchanged", t => {
  const file = process.env.LEMURIA_LIVE_SESSIONS_JS;
  if (!file) { t.skip("Set actual sessions chunk"); return; }
  const code = fs.readFileSync(file, "utf8"), patched = patchSessions(code);
  assert.equal((patched.match(/\.location\?\.timezone\?\?"Europe\/Moscow"/g) || []).length, 2);
  const originalReview = code.match(/\(0,\w+\.r6\)\(\w+.startsAt,\w+.timezone\)/g);
  assert.equal(originalReview.length, 2);
  for (const call of originalReview) assert.ok(patched.includes(call));
  let modules;
  vm.runInNewContext(code, { self: { webpackChunk_N_E: { push: c => { modules = c[1]; } } } });
  const exports = {}, req = () => { throw new Error("Unexpected dependency"); };
  req.d = (target, defs) => Object.keys(defs).forEach(k => Object.defineProperty(target, k, { get: defs[k] }));
  modules[16382]({}, exports, req);
  const expressions = [...patched.matchAll(/\(0,(\w+)\.r6\)\((\w+)\.(startsAt|endsAt),\2.location\?\.timezone\?\?"Europe\/Moscow"\)/g)];
  assert.equal(expressions.length, 2);
  for (const m of expressions) {
    const row = { startsAt: "2026-11-07T06:30:00Z", endsAt: "2026-11-07T06:50:00Z", location: { timezone: "Europe/Saratov" } };
    assert.match(vm.runInNewContext(m[0], { [m[1]]: exports, [m[2]]: row }), m[3] === "startsAt" ? /10:30/ : /10:50/);
    row.location = { timezone: "Europe/Moscow" };
    assert.match(vm.runInNewContext(m[0], { [m[1]]: exports, [m[2]]: row }), m[3] === "startsAt" ? /09:30/ : /09:50/);
  }
  assert.throws(() => patchSessions(patched));
});

test("mixed overview shifts resolve location metadata without changing the default timezone", () => {
  const original = '"Смены сегодня";"Ближайшие сеансы";D.locations?.find(loc=>loc.id===e.location?.id);(0,E.r6)(e.openedAt)';
  const patched = patchOverviewShift(original);
  const expression = patched.slice(patched.lastIndexOf(";(0,") + 1);
  const D = { timezone: "Europe/Moscow", locations: [{ id: "a", city: "Саратов", name: "Парк А", timezone: "Europe/Saratov" }, { id: "b", city: "Волгоград", name: "Парк Б", timezone: "Europe/Moscow" }] };
  const E = { r6: (when, tz) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(when)) };
  const display = location => vm.runInNewContext(expression, { D, E, e: { location, openedAt: "2026-11-07T06:30:00Z" } });
  assert.equal(display("Саратов"), "10:30"); assert.equal(display("Парк А"), "10:30");
  assert.equal(display("Волгоград"), "09:30"); assert.equal(display("unknown"), "09:30");
  assert.throws(() => patchOverviewShift(patched));
});

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
