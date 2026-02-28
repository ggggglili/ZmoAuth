import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getSystemSettings, setSystemSettings } from "@/lib/services/system-settings.service";

const schema = z.object({
  systemName: z.string().trim().min(1).max(100),
  licenseRebindCostPoints: z.number().int().min(0).max(1_000_000),
  smtp: z.object({
    enabled: z.boolean(),
    host: z.string().max(255),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().max(255),
    fromEmail: z.string().max(320),
    fromName: z.string().max(100),
    password: z.string().max(256).optional(),
  }),
});

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getSystemSettings();
    return Response.json({ settings }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "Invalid request payload", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const settings = await setSystemSettings(actor, parsed.data);
    return Response.json({ settings }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
