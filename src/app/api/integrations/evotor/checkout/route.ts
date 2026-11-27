import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { authenticateTerminal, handleTerminalRequest } from "@/server/services/evotor-checkout";
export async function POST(request: Request) {
  try {
    const terminal = authenticateTerminal(request);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError("VALIDATION_ERROR", "Пустой запрос", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); throw new ApiError("VALIDATION_ERROR", "Запрос слишком большой", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new ApiError("VALIDATION_ERROR", "Некорректный JSON", 400); }
    return apiSuccess(await handleTerminalRequest(terminal, body));
  } catch (error) { return handleApiError(error); }
}
