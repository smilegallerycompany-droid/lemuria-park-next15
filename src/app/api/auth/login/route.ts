import { z } from "zod";
import { apiSuccess, handleApiError, ApiError } from "@/lib/api/response";
import { loginStaff } from "@/server/auth/login";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  portal: z.enum(["cashier", "director"]).default("cashier"),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в теле запроса", 400);
    });
    const input = schema.parse(json);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent");

    const allowedRoles =
      input.portal === "director"
        ? (["ADMIN", "OWNER"] as const)
        : (["CASHIER", "ADMIN", "OWNER"] as const);

    const user = await loginStaff({
      email: input.email,
      password: input.password,
      allowedRoles: [...allowedRoles],
      ip,
      ua,
    });

    return apiSuccess({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      locationIds: user.locationIds,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
