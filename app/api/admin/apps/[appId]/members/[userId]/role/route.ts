import { z } from "zod";
import { AppMemberRole } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { setAppMemberRoleByAdmin } from "@/lib/services/member.service";

interface Params {
  params: Promise<{ appId: string; userId: string }>;
}

const schema = z.object({
  role: z.enum([AppMemberRole.MEMBER, AppMemberRole.RESELLER]),
  parentResellerUserId: z.string().uuid().nullable().optional(),
});

export async function PUT(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId, userId } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const member = await setAppMemberRoleByAdmin(actor, appId, {
      userId,
      role: parsed.data.role,
      parentResellerUserId: parsed.data.parentResellerUserId ?? null,
    });

    return Response.json({ message: "角色更新成功", member }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
