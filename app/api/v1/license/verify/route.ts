import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { verifyLicense } from "@/lib/services/license.service";

const schema = z.object({
  license_key: z.string().min(1).max(128),
  bind_target: z.string().min(1).max(255),
  timestamp: z.number().int(),
  nonce: z.string().min(8).max(128),
  sign: z.string().min(16).max(256),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          valid: false,
          status: "INVALID_PAYLOAD",
          expires_at: null,
          server_time: new Date().toISOString(),
          signature: "",
          errors: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = await verifyLicense(parsed.data);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
