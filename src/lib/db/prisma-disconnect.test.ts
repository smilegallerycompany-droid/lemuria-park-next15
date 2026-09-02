import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPrismaServerClosed, withPrismaIdleRetry } from "./prisma-disconnect";

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

describe("withPrismaIdleRetry", () => {
  it("reconnects once on P1017 then returns", async () => {
    let calls = 0;
    let reconnects = 0;
    const result = await withPrismaIdleRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("Server has closed the connection."), { code: "P1017" });
        }
        return "ok";
      },
      async () => {
        reconnects += 1;
      },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 2);
    assert.equal(reconnects, 1);
  });

  it("does not retry unrelated errors", async () => {
    let reconnects = 0;
    await assert.rejects(
      () =>
        withPrismaIdleRetry(
          async () => {
            throw new Error("P2024 timeout");
          },
          async () => {
            reconnects += 1;
          },
        ),
      /P2024 timeout/,
    );
    assert.equal(reconnects, 0);
  });
});
