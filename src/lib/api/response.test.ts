import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorBody } from "@/types/api";
import { handleApiError } from "@/lib/api/response";
import { DomainError } from "@/server/domain/errors";

async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  return (await response.json()) as ApiErrorBody;
}

test("handleApiError maps INSUFFICIENT_CAPACITY to HTTP 409", async () => {
  const response = handleApiError(
    new DomainError(
      "INSUFFICIENT_CAPACITY",
      "Недостаточно свободных мест: доступно 0, запрошено 2",
    ),
  );
  assert.equal(response.status, 409);
  const body = await readErrorBody(response);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "INSUFFICIENT_CAPACITY");
});

test("handleApiError maps RESERVATION_EXPIRED to HTTP 410", async () => {
  const response = handleApiError(
    new DomainError("RESERVATION_EXPIRED", "Время бронирования истекло"),
  );
  assert.equal(response.status, 410);
  const body = await readErrorBody(response);
  assert.equal(body.error.code, "RESERVATION_EXPIRED");
});

test("handleApiError maps *_NOT_FOUND domain errors to HTTP 404, preserving the precise code", async () => {
  const response = handleApiError(new DomainError("SESSION_NOT_FOUND", "Сеанс не найден"));
  assert.equal(response.status, 404);
  const body = await readErrorBody(response);
  // Domain error codes pass through verbatim so clients can branch on the
  // precise reason (SESSION_NOT_FOUND vs ORDER_NOT_FOUND, etc.), instead of
  // collapsing everything into a generic "NOT_FOUND" bucket.
  assert.equal(body.error.code, "SESSION_NOT_FOUND");
});

test("handleApiError maps SESSION_SOLD_OUT to HTTP 409", async () => {
  const response = handleApiError(
    new DomainError("SESSION_SOLD_OUT", "На этот сеанс уже нет свободных мест"),
  );
  assert.equal(response.status, 409);
  const body = await readErrorBody(response);
  assert.equal(body.error.code, "SESSION_SOLD_OUT");
});

test("handleApiError maps CONFIG_NOT_FOUND to HTTP 404", async () => {
  const response = handleApiError(
    new DomainError("CONFIG_NOT_FOUND", "Активная локация не найдена"),
  );
  assert.equal(response.status, 404);
  const body = await readErrorBody(response);
  assert.equal(body.error.code, "CONFIG_NOT_FOUND");
});

test("handleApiError maps IDEMPOTENCY_CONFLICT to HTTP 409", async () => {
  const response = handleApiError(
    new DomainError(
      "IDEMPOTENCY_CONFLICT",
      "Этот Idempotency-Key уже использован с другими данными запроса",
    ),
  );
  assert.equal(response.status, 409);
  const body = await readErrorBody(response);
  assert.equal(body.error.code, "IDEMPOTENCY_CONFLICT");
});

test("handleApiError never leaks unexpected error details for unknown errors", async () => {
  const response = handleApiError(new Error("some internal detail that must not leak"));
  assert.equal(response.status, 500);
  const body = await readErrorBody(response);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(body).includes("some internal detail"), false);
});
