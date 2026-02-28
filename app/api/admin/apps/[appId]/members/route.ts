import { z } from "zod";
import { AppMemberRole } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listAppMembersByAdmin, setAppMemberRoleByAdmin } from "@/lib/services/member.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const schema = z.object({
  userId: z.uuid(),
  role: z.enum([AppMemberRole.MEMBER, AppMemberRole.RESELLER]),
  parentResellerUserId: z.uuid().nullable().optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const member = await setAppMemberRoleByAdmin(actor, appId, {
      userId: parsed.data.userId,
      role: parsed.data.role,
      parentResellerUserId: parsed.data.parentResellerUserId ?? null,
    });

    return Response.json({ message: "ok", member }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;
    const items = await listAppMembersByAdmin(actor, appId);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
