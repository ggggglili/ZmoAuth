import { errorResponse } from "@/lib/errors";
import { getUpdatePackage } from "@/lib/services/update.service";

interface Params {
  params: Promise<{ appId: string; version: string }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const url = new URL(req.url);
    const licenseKey = url.searchParams.get("licenseKey")?.trim() ?? "";
    if (!licenseKey) {
      return Response.json({ message: "缺少 licenseKey 参数" }, { status: 400 });
    }

    const { appId, version } = await params;
    const result = await getUpdatePackage(appId, version, licenseKey);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
