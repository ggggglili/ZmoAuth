import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { checkForAppUpdate } from "@/lib/services/update.service";

interface Params {
  params: Promise<{ appId: string }>;
}

const schema = z.object({
  currentVersion: z.string().min(1),
  licenseKey: z.string().min(1).max(128),
});

export async function POST(req: Request, { params }: Params) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "请求参数不合法", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { appId } = await params;
    const result = await checkForAppUpdate(appId, parsed.data.currentVersion, parsed.data.licenseKey);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
