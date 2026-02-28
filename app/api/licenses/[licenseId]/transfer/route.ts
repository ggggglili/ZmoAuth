import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { transferLicenseToChildForCurrentUser } from "@/lib/services/license.service";

interface Params {
  params: Promise<{ licenseId: string }>;
}

const schema = z.object({
  targetUserId: z.uuid(),
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

    const result = await transferLicenseToChildForCurrentUser(actor, licenseId, parsed.data.targetUserId);
    return Response.json(
      {
        ...result,
        message: "转让成功，原绑定已清空，请新用户重新绑定。",
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
