import { requireAdmin } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { buildPhpSdkByAdmin } from "@/lib/services/admin-app.service";

interface Params {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await requireAdmin();
    const { appId } = await params;

    const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "https://your-domain.com";
    const sdkFile = await buildPhpSdkByAdmin(appId, actor.id, baseUrl);

    return new Response(sdkFile.content, {
      status: 200,
      headers: {
        "Content-Type": "application/x-httpd-php; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sdkFile.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

