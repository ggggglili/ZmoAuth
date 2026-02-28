import { requireSessionUser } from "@/lib/auth/session";
import { PlatformRole } from "@prisma/client";
import { errorResponse } from "@/lib/errors";
import { listLicensesForCurrentUser } from "@/lib/services/license.service";
import { getSystemSettings } from "@/lib/services/system-settings.service";

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const [items, settings] = await Promise.all([listLicensesForCurrentUser(actor), getSystemSettings()]);
    return Response.json(
      {
        items,
        licenseRebindCostPoints: settings.licenseRebindCostPoints,
        canTransferUser: actor.role !== PlatformRole.SUPER_ADMIN,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
