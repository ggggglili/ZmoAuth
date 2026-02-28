import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listLicensesForCurrentUser } from "@/lib/services/license.service";
import { getSystemSettings } from "@/lib/services/system-settings.service";

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const [items, settings] = await Promise.all([listLicensesForCurrentUser(actor), getSystemSettings()]);
    return Response.json({ items, licenseRebindCostPoints: settings.licenseRebindCostPoints }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
