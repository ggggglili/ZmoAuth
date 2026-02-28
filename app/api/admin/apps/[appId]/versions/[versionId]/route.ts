import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { deleteAppVersion, updateAppVersion } from "@/lib/services/admin-app.service";

interface Params {
  params: Promise<{ appId: string; versionId: string }>;
}

const updateSchema = z
  .object({
    downloadUrl: z.string().url().max(2000).optional(),
    releaseNote: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId, versionId } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const item = await updateAppVersion(appId, versionId, {
      downloadUrl: parsed.data.downloadUrl,
      releaseNote: parsed.data.releaseNote,
    }, actor.id);
    return Response.json({ item }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId, versionId } = await params;
    const result = await deleteAppVersion(appId, versionId, actor.id);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
