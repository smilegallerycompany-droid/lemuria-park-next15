"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {prepareSchema}=require("./build-evotor-production-schema.cjs");
const root=process.env.EVOTOR_PRODUCTION_REVIEW_ROOT;
test("production schema retains every existing model and adds only the queue relation",{skip:!root},()=>{
  const production=fs.readFileSync(path.join(root,"prisma/schema.prisma"),"utf8");
  const candidate=fs.readFileSync(path.join(__dirname,"../prisma/schema.prisma"),"utf8");
  const result=prepareSchema(production,candidate);
  assert.ok(result.includes("model OrderExtra"));
  assert.ok(result.includes("secondarySessionId"));
  assert.ok(result.includes("succeededAt"));
  const restored=result.replace("\n  evotorCheckout EvotorCheckout?","").replace(/\nmodel EvotorCheckout \{[^]*$/,"");
  assert.equal(restored,production);
  assert.throws(()=>prepareSchema(production+"\n",candidate),/differs/);
  assert.throws(()=>prepareSchema(result,candidate),/differs/);
});
