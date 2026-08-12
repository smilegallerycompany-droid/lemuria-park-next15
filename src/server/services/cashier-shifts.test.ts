import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cashDifferenceKopecks,
  currentCashBalanceKopecks,
  differenceLabel,
  expectedCashKopecks,
} from "@/server/domain/shift.domain";
import { assertAllowedImageUpload, ALLOWED_IMAGE_MIME } from "@/server/media/storage";
import { signS3Request } from "@/server/media/s3-sign";

describe("shift cash math", () => {
  it("computes expected cash and difference labels", () => {
    const expected = expectedCashKopecks({
      openingCashAmount: 500_00,
      cashSalesAmount: 200_00,
      cashRefundsAmount: 50_00,
      cashInAmount: 100_00,
      cashOutAmount: 20_00,
    });
    assert.equal(expected, 730_00);
    assert.equal(
      currentCashBalanceKopecks({
        openingCashAmount: 500_00,
        cashSalesAmount: 200_00,
        cashRefundsAmount: 50_00,
        cashInAmount: 100_00,
        cashOutAmount: 20_00,
      }),
      expected,
    );
    assert.equal(cashDifferenceKopecks(730_00, expected), 0);
    assert.equal(differenceLabel(0), "ok");
    assert.equal(differenceLabel(-100), "shortage");
    assert.equal(differenceLabel(50), "overage");
  });

  it("includes audited adjustments in live balance", () => {
    const balance = currentCashBalanceKopecks({
      openingCashAmount: 100_00,
      cashSalesAmount: 0,
      cashRefundsAmount: 0,
      cashInAmount: 0,
      cashOutAmount: 0,
      adjustmentsAmount: -15_00,
    });
    assert.equal(balance, 85_00);
  });

  it("shortage when actual is below expected", () => {
    const expected = expectedCashKopecks({
      openingCashAmount: 100_00,
      cashSalesAmount: 0,
      cashRefundsAmount: 0,
      cashInAmount: 0,
      cashOutAmount: 0,
    });
    const diff = cashDifferenceKopecks(88_00, expected);
    assert.equal(diff, -12_00);
    assert.equal(differenceLabel(diff), "shortage");
  });
});

describe("media upload validation", () => {
  it("allows jpeg/png/webp and rejects svg", () => {
    assert.ok(ALLOWED_IMAGE_MIME.has("image/jpeg"));
    assert.doesNotThrow(() =>
      assertAllowedImageUpload({ mimeType: "image/png", byteSize: 1024 }),
    );
    assert.throws(() =>
      assertAllowedImageUpload({ mimeType: "image/svg+xml", byteSize: 100 }),
    );
  });
});

describe("s3 signer", () => {
  it("produces Authorization header without leaking secret as plain", () => {
    const { headers } = signS3Request({
      method: "PUT",
      endpointHost: "storage.yandexcloud.net",
      path: "/bucket/key.jpg",
      region: "ru-central1",
      accessKey: "access",
      secretKey: "secret-key-value",
      payload: Buffer.from("hello"),
      contentType: "image/jpeg",
      amzDate: new Date("2026-08-10T00:00:00.000Z"),
    });
    assert.match(headers.Authorization!, /^AWS4-HMAC-SHA256 Credential=access\//);
    assert.equal(headers["X-Amz-Content-Sha256"]?.length, 64);
    assert.ok(!headers.Authorization!.includes("secret-key-value"));
  });
});
