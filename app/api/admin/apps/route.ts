import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { createApp, listApps } from "@/lib/services/admin-app.service";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  downloadUrl: z.string().url().max(2000).nullable().optional(),
  weekPoints: z.number().int().nonnegative(),
  monthPoints: z.number().int().nonnegative(),
  yearPoints: z.number().int().nonnegative(),
  lifetimePoints: z.number().int().nonnegative(),
});

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";
    const items = await listApps({ includeDeleted });
    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireAdmin();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const app = await createApp({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      downloadUrl: parsed.data.downloadUrl ?? null,
      weekPoints: parsed.data.weekPoints,
      monthPoints: parsed.data.monthPoints,
      yearPoints: parsed.data.yearPoints,
      lifetimePoints: parsed.data.lifetimePoints,
    }, actor.id);
    return Response.json({ app }, { status: 201 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
