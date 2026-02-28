import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { queryDomainAuthorization } from "@/lib/services/license.service";

const querySchema = z.object({
  domain: z.string().trim().min(1).max(253),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      domain: searchParams.get("domain") ?? "",
    });

    if (!parsed.success) {
      return Response.json(
        {
          code: "VALIDATION_ERROR",
          message: "domain is required",
          errors: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = await queryDomainAuthorization(parsed.data.domain);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
