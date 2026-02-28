import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { setLicenseStatusByAdmin } from "@/lib/services/license.service";

interface Params {
  params: Promise<{ licenseId: string }>;
}

const schema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { licenseId } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: "请求参数不合法", errors: parsed.error.flatten() }, { status: 400 });
    }

    const item = await setLicenseStatusByAdmin(actor, licenseId, parsed.data.status);
    return Response.json({ item }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

