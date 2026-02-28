import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { setAppResellerDiscount } from "@/lib/services/discount.service";

interface Params {
  params: Promise<{ appId: string; userId: string }>;
}

const schema = z.object({
  discountRate: z.number().gt(0).lte(1),
});

export async function PUT(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId, userId } = await params;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const item = await setAppResellerDiscount(appId, userId, parsed.data.discountRate, actor.id);
    return Response.json({ item }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
