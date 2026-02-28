import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { createResellerInvite, listInvitesByReseller } from "@/lib/services/invite.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const schema = z.object({
  maxUses: z.number().int().positive().max(100).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const { appId } = await params;
    const actor = await requireSessionUser();

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const invite = await createResellerInvite(actor, appId, {
      maxUses: parsed.data.maxUses ?? 10,
      expiresInDays: parsed.data.expiresInDays,
    });

    return Response.json(
      {
        code: invite.code,
        inviteLink: `/register?invite=${invite.code}`,
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        expiresAt: invite.expiresAt,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { appId } = await params;
    const actor = await requireSessionUser();
    const items = await listInvitesByReseller(appId, actor.id, 50);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
