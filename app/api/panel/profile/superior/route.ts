import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getPanelSuperiorEmail } from "@/lib/services/panel-user.service";

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const superiorEmail = await getPanelSuperiorEmail(actor);
    return Response.json({ superiorEmail }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

