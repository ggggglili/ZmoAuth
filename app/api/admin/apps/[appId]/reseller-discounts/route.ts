import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listAppResellerDiscounts } from "@/lib/services/discount.service";

interface Params {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { appId } = await params;
    const items = await listAppResellerDiscounts(appId);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
