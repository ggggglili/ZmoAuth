import { validateInviteCode } from "@/lib/services/invite.service";

interface Params {
  params: Promise<{ code: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const result = await validateInviteCode(code);

  if (!result.valid) {
    return Response.json(
      {
        valid: false,
        reason: result.reason,
      },
      { status: 200 }
    );
  }

  return Response.json(
    {
      valid: true,
      remainingUses: result.remainingUses,
      expiresAt: result.expiresAt,
    },
    { status: 200 }
  );
}
