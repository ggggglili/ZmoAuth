import { PlanType } from "@prisma/client";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { createOrder } from "@/lib/services/order.service";

const schema = z.object({
  appId: z.uuid(),
  planType: z.enum([PlanType.WEEK, PlanType.MONTH, PlanType.YEAR, PlanType.LIFETIME]),
});

export async function POST(req: Request) {
  try {
    const actor = await requireSessionUser();
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const order = await createOrder(actor, parsed.data);
    return Response.json({ order }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
