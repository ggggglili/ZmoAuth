import { AppMemberRole, PlatformRole } from "@prisma/client";
import { requireSessionUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/errors";
import { getUserAppMemberships } from "@/lib/services/app.service";

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const memberships = await getUserAppMemberships(actor);

    if (actor.role === PlatformRole.SUPER_ADMIN) {
      return Response.json({ items: memberships }, { status: 200 });
    }

    const items = memberships.filter(
      (item) => item.role === AppMemberRole.OWNER || item.role === AppMemberRole.RESELLER
    );

    return Response.json({ items }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
