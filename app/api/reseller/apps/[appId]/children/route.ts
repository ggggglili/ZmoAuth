import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { listChildrenForReseller } from "@/lib/services/member.service";

interface Params {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await requireSessionUser();
    const { appId } = await params;
    const items = await listChildrenForReseller(actor, appId);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
