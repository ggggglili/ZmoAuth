import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { createAdminInvite, listInvitesByAdmin } from "@/lib/services/invite.service";

const schema = z.object({
  maxUses: z.number().int().positive().max(100).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const invite = await createAdminInvite(actor, {
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

export async function GET() {
  try {
    await requireAdmin();
    const invites = await listInvitesByAdmin(50);
    return Response.json({ items: invites }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
