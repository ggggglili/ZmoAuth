import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listPanelUsers } from "@/lib/services/panel-user.service";

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const result = await listPanelUsers(actor);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
