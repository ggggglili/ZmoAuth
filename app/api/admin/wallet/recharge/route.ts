import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { adminRecharge } from "@/lib/services/wallet.service";

const schema = z.object({
  userId: z.uuid(),
  points: z.number().int().positive().max(1_000_000),
});

export async function POST(req: Request) {
  try {
    const actor = await requireAdmin();

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const wallet = await adminRecharge(actor, {
      userId: parsed.data.userId,
      points: parsed.data.points,
    });

    return Response.json({ success: true, balance: wallet.pointBalance }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
