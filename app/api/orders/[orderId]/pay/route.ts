import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { payOrder } from "@/lib/services/order.service";

interface Params {
  params: Promise<{ orderId: string }>;
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const actor = await requireSessionUser();
    const { orderId } = await params;
    const result = await payOrder(actor, orderId);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
