import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listPurchasableAppsForUser } from "@/lib/services/app.service";

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const items = await listPurchasableAppsForUser(actor);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
