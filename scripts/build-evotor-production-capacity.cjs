"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Script } = require("node:vm");
const { createHash } = require("node:crypto");

// This is a preparation step, not a deploy script. It must be applied alongside
// the Evotor migration/client and payment routes in the isolated staging image.
function patchRepository(body) {
  const start = "async aggregateOrderedQuantity(a,b,c=new Date){";
  const end = "findStaleAwaitingPaymentIds:";
  assert.equal(body.split(start).length, 2, "Unknown production repository");
  const from = body.indexOf(start), to = body.indexOf(end, from);
  assert.ok(to > from);
  const original = body.slice(from, to);
  assert.ok(original.includes('paymentExpiresAt:{gt:c}'));
  assert.ok(original.includes('ticketType:{countsTowardCapacity:!0}'));
  assert.equal(original.split("async findOccupyingForSessions").length, 2);
  return body.slice(0, from) +
    'aggregateOrderedQuantity(a,b,c){return require("/app/evotor-production-capacity.cjs").aggregateOrderedQuantity(a,b,c)},' +
    'findOccupyingForSessions(a,b,c){return require("/app/evotor-production-capacity.cjs").findOccupyingForSessions(a,b,c)},' +
    body.slice(to);
}

function build(root) {
  const files = [".next/server/chunks/670.js", ".next/server/chunks/4654.js"];
  const prepared = files.map(file => {
    const before = fs.readFileSync(path.join(root,file), "utf8");
    const after = patchRepository(before);
    new Script(after, { filename: file });
    return { file, before, after };
  });
  // Prepare every file before writing, so an unexpected image fails closed.
  for (const { file, after } of prepared) fs.writeFileSync(path.join(root,file),after);
  fs.copyFileSync(path.join(__dirname,"evotor-production-capacity.cjs"), path.join(root,"evotor-production-capacity.cjs"));
  return prepared.map(({file,before,after}) => ({ path:file,
    before:createHash("sha256").update(before).digest("hex"),
    after:createHash("sha256").update(after).digest("hex") }));
}
module.exports = { patchRepository, build };
if (require.main === module) console.log(JSON.stringify(build(path.resolve(process.argv[2]))));
