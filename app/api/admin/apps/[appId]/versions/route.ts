import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { createAppVersion, listAppVersions } from "@/lib/services/admin-app.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const createSchema = z.object({
  version: z.string().min(1).max(50),
  downloadUrl: z.string().url().max(2000),
  releaseNote: z.string().max(2000).optional(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { appId } = await params;
    const items = await listAppVersions(appId);
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const item = await createAppVersion(appId, {
      version: parsed.data.version,
      downloadUrl: parsed.data.downloadUrl,
      releaseNote: parsed.data.releaseNote ?? null,
    }, actor.id);
    return Response.json({ item }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
