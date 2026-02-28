import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { bindLicenseForCurrentUser } from "@/lib/services/license.service";

interface Params {
  params: Promise<{ licenseId: string }>;
}

const schema = z.object({
  bindTarget: z.string().min(1).max(255),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await requireSessionUser();
    const { licenseId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await bindLicenseForCurrentUser(actor, licenseId, parsed.data.bindTarget);
    const message = !result.changed
      ? "绑定目标未变化"
      : result.isRebind
        ? result.chargedPoints > 0
          ? `更换绑定成功，已扣除 ${result.chargedPoints} 积分`
          : "更换绑定成功"
        : "绑定成功";

    return Response.json(
      {
        binding: result.binding,
        changed: result.changed,
        isRebind: result.isRebind,
        chargedPoints: result.chargedPoints,
        message,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
