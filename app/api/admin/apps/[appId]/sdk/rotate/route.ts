import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { rotateAppSecretsByAdmin } from "@/lib/services/admin-app.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const schema = z.object({
  target: z.enum(["SDK_SECRET", "UPDATE_SIGN_SECRET", "BOTH"]),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: "请求参数不合法", errors: parsed.error.flatten() }, { status: 400 });
    }

    const result = await rotateAppSecretsByAdmin(appId, parsed.data.target, actor.id);
    return Response.json({ result }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

