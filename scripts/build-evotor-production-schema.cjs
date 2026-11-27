"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const baseline=require("../docs/evotor/production-baseline-20261127.json");
function prepareSchema(production, candidate){
  assert.equal(crypto.createHash("sha256").update(production).digest("hex"),
    baseline.files["prisma/schema.prisma"],"Production schema differs from the reviewed baseline");
  assert.ok(!production.includes("model EvotorCheckout"),"Queue already present");
  const queue=candidate.match(/^model EvotorCheckout \{[^]*?^\}/m)?.[0];
  assert.ok(queue,"Candidate queue model missing");
  assert.equal(production.split("model Order {").length,2,"Ambiguous Order model");
  return production.replace("model Order {","model Order {\n  evotorCheckout EvotorCheckout?")+"\n"+queue+"\n";
}
module.exports={prepareSchema};
