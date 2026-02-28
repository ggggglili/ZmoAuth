import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listLicensesByAdmin } from "@/lib/services/license.service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ message: "请求参数不合法", errors: parsed.error.flatten() }, { status: 400 });
    }

    const items = await listLicensesByAdmin(parsed.data.limit ?? 200);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

