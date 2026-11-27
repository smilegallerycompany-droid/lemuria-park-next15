import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api/response";

const terminalSchema = z.array(z.object({
  id: z.string().min(1), locationId: z.string().min(1),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
}));
function terminals() {
  let rows: z.infer<typeof terminalSchema>;
  try {
    rows = terminalSchema.parse(JSON.parse(process.env.EVOTOR_TERMINALS_JSON || "[]"));
  } catch {
    throw new ApiError("NOT_CONFIGURED", "Некорректная конфигурация касс", 503);
  }
  if (new Set(rows.map(t => t.id)).size !== rows.length || new Set(rows.map(t => t.tokenHash)).size !== rows.length) {
    throw new ApiError("NOT_CONFIGURED", "Неоднозначная конфигурация касс", 503);
  }
  return rows;
}
export function terminalForLocation(locationId: string) {
  const matches = terminals().filter(t => t.locationId === locationId);
  if (matches.length > 1) throw new ApiError("NOT_CONFIGURED", "Неоднозначная привязка кассы", 503);
  return matches[0] ?? null;
}
export function authenticateTerminal(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.length < 32 || token === "lemuria-evotor-staging-connectivity") {
    throw new ApiError("UNAUTHORIZED", "Требуется токен кассы", 401);
  }
  const hash = createHash("sha256").update(token).digest();
  const matches = terminals().filter(t => timingSafeEqual(hash, Buffer.from(t.tokenHash, "hex")));
  if (matches.length !== 1) throw new ApiError("UNAUTHORIZED", "Неизвестная касса", 401);
  return matches[0];
}
