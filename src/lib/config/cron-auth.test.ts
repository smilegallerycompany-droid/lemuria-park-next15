import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIMER_CLEANUP_PAYLOAD,
  extractCronSecret,
  isYandexTimerCleanupEvent,
  secretsEqual,
} from "@/lib/config/cron-auth";

test("secretsEqual accepts matching secrets and rejects mismatches", () => {
  assert.equal(secretsEqual("same-secret-value", "same-secret-value"), true);
  assert.equal(secretsEqual("same-secret-value", "other-secret-value"), false);
  assert.equal(secretsEqual("short", "much-longer-secret"), false);
});

test("isYandexTimerCleanupEvent accepts timer messages with discriminator only", () => {
  assert.equal(isYandexTimerCleanupEvent(null), false);
  assert.equal(isYandexTimerCleanupEvent({ messages: [] }), false);
  assert.equal(
    isYandexTimerCleanupEvent({
      messages: [
        {
          event_metadata: { event_type: "yandex.cloud.events.serverless.triggers.TimerMessage" },
          details: { payload: TIMER_CLEANUP_PAYLOAD },
        },
      ],
    }),
    true,
  );
  assert.equal(
    isYandexTimerCleanupEvent({
      messages: [
        {
          event_metadata: { event_type: "yandex.cloud.events.serverless.triggers.TimerMessage" },
          details: { payload: "other" },
        },
      ],
    }),
    false,
  );
});

test("extractCronSecret reads Bearer then X-Cron-Secret", () => {
  assert.equal(
    extractCronSecret(new Headers({ authorization: "Bearer cron-token" })),
    "cron-token",
  );
  assert.equal(
    extractCronSecret(new Headers({ "x-cron-secret": "header-token" })),
    "header-token",
  );
  assert.equal(extractCronSecret(new Headers()), null);
});
