import { InviteIssuerType, PlatformRole } from "@prisma/client";
import { requireSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/errors";
import {
  createAdminInvite,
  createResellerGlobalInvite,
  getLatestInviteByIssuer,
  listInviteRedeemRecordsByIssuer,
} from "@/lib/services/invite.service";

const UNLIMITED_MAX_USES = 2147483647;
const UNLIMITED_EXPIRES_DAYS = 365000;
const UNLIMITED_EXPIRES_YEAR = 3000;

async function hasResellerRole(userId: string) {
  const member = await prisma.appMember.findFirst({
    where: {
      userId,
      role: "RESELLER",
      app: { isDeleted: false },
    },
    select: { id: true },
  });
  return Boolean(member);
}

function isFixedInvite(invite: {
  maxUses: number;
  expiresAt: string;
  isRevoked: boolean;
}) {
  if (invite.isRevoked) return false;
  if (invite.maxUses < UNLIMITED_MAX_USES) return false;
  const expiresAt = new Date(invite.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getFullYear() >= UNLIMITED_EXPIRES_YEAR;
}

export async function GET() {
  try {
    const actor = await requireSessionUser();
    const isSuperAdmin = actor.role === PlatformRole.SUPER_ADMIN;
    const isReseller = isSuperAdmin ? true : await hasResellerRole(actor.id);

    if (!isReseller) {
      return Response.json({ scope: "none", items: [], records: [] }, { status: 200 });
    }

    const issuerType = isSuperAdmin ? InviteIssuerType.SUPER_ADMIN : InviteIssuerType.RESELLER;
    const [latestInvite, records] = await Promise.all([
      getLatestInviteByIssuer(issuerType, actor.id),
      listInviteRedeemRecordsByIssuer(issuerType, actor.id, 100),
    ]);

    const items = latestInvite && isFixedInvite(latestInvite) ? [{ ...latestInvite, issuerType, appId: null }] : [];
    const scope = isSuperAdmin ? "admin" : "reseller";

    return Response.json({ scope, items, records }, { status: 200 });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const actor = await requireSessionUser();
    const isSuperAdmin = actor.role === PlatformRole.SUPER_ADMIN;
    const isReseller = isSuperAdmin ? true : await hasResellerRole(actor.id);

    if (!isReseller) {
      return Response.json({ message: "仅管理员或授权商可生成邀请码" }, { status: 403 });
    }

    const issuerType = isSuperAdmin ? InviteIssuerType.SUPER_ADMIN : InviteIssuerType.RESELLER;
    const latestInvite = await getLatestInviteByIssuer(issuerType, actor.id);

    if (latestInvite && isFixedInvite(latestInvite)) {
      return Response.json(
        {
          message: "当前账号已存在固定邀请码，已返回现有邀请码",
          code: latestInvite.code,
          inviteLink: `/register?invite=${latestInvite.code}`,
          maxUses: latestInvite.maxUses,
          usedCount: latestInvite.usedCount,
          expiresAt: latestInvite.expiresAt,
          issuerType,
          appId: null,
        },
        { status: 200 }
      );
    }

    if (isSuperAdmin) {
      const invite = await createAdminInvite(actor, {
        maxUses: UNLIMITED_MAX_USES,
        expiresInDays: UNLIMITED_EXPIRES_DAYS,
      });

      return Response.json(
        {
          code: invite.code,
          inviteLink: `/register?invite=${invite.code}`,
          maxUses: invite.maxUses,
          usedCount: invite.usedCount,
          expiresAt: invite.expiresAt,
          issuerType: "SUPER_ADMIN",
          appId: null,
        },
        { status: 201 }
      );
    }

    const invite = await createResellerGlobalInvite(actor, {
      maxUses: UNLIMITED_MAX_USES,
      expiresInDays: UNLIMITED_EXPIRES_DAYS,
    });

    return Response.json(
      {
        code: invite.code,
        inviteLink: `/register?invite=${invite.code}`,
        maxUses: invite.maxUses,
        usedCount: invite.usedCount,
        expiresAt: invite.expiresAt,
        issuerType: "RESELLER",
        appId: null,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
