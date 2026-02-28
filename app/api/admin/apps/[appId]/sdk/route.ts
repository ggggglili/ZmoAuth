import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getAppSdkInfoByAdmin } from "@/lib/services/admin-app.service";

interface Params {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { appId } = await params;
    const sdk = await getAppSdkInfoByAdmin(appId);
    return Response.json({ sdk }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

