import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPrismaServerClosed } from "./prisma-disconnect";

describe("isPrismaServerClosed", () => {
  it("recognizes Prisma P1017", () => {
    assert.equal(isPrismaServerClosed({ code: "P1017", message: "Server has closed the connection." }), true);
  });

  it("recognizes the pooler close message without a code", () => {
    assert.equal(isPrismaServerClosed(new Error("Server has closed the connection.")), true);
  });

  it("does not treat unrelated Prisma errors as idle disconnects", () => {
    assert.equal(isPrismaServerClosed({ code: "P2021", message: "table does not exist" }), false);
    assert.equal(isPrismaServerClosed({ code: "P1001", message: "Can't reach database server" }), false);
    assert.equal(isPrismaServerClosed(null), false);
    assert.equal(isPrismaServerClosed("boom"), false);
  });
});
