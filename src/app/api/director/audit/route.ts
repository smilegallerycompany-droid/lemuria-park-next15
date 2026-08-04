import { apiSuccess, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireDirector } from "@/server/auth/staff-session";

export async function GET(req: Request) {
  try {
    await requireDirector();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? undefined;
    const entityType = url.searchParams.get("entityType") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return apiSuccess({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
