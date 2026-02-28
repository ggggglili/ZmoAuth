import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getAppById, softDeleteApp, updateApp } from "@/lib/services/admin-app.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    downloadUrl: z.string().url().max(2000).nullable().optional(),
    weekPoints: z.number().int().nonnegative().optional(),
    monthPoints: z.number().int().nonnegative().optional(),
    yearPoints: z.number().int().nonnegative().optional(),
    lifetimePoints: z.number().int().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const { appId } = await params;
    const app = await getAppById(appId);
    return Response.json({ app }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const app = await updateApp(appId, parsed.data, actor.id);
    return Response.json({ app }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;
    const result = await softDeleteApp(appId, actor.id);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
