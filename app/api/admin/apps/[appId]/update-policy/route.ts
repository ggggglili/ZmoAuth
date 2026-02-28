import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getAppUpdatePolicyByAdmin, upsertAppUpdatePolicyByAdmin } from "@/lib/services/update.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const schema = z.object({
  offlineTtlSeconds: z.number().int().min(60).max(604800),
  forceUpdateMinVersion: z.string().max(50).nullable().optional(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { appId } = await params;
    const policy = await getAppUpdatePolicyByAdmin(appId);
    return Response.json({ policy }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const policy = await upsertAppUpdatePolicyByAdmin(actor, appId, parsed.data);
    return Response.json({ policy }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
