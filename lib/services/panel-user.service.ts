import { AppMemberRole, PlatformRole } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { InviteIssuerType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

export interface PanelUserItem {
  userId: string;
  email: string;
  platformRole: string;
  isEnvAdmin: boolean;
  appRole: string | null;
  pointBalance: number;
  appId: string | null;
  appName: string | null;
}

export interface PanelUsersResult {
  scope: "admin" | "reseller";
  items: PanelUserItem[];
}

async function repairResellerGlobalInviteMembers(actorId: string) {
  const managerMember = await prisma.appMember.findFirst({
    where: {
      userId: actorId,
      role: AppMemberRole.RESELLER,
      app: { isDeleted: false },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { appId: true },
  });

  if (!managerMember) return;

  const globalInvites = await prisma.invite.findMany({
    where: {
      issuerType: InviteIssuerType.RESELLER,
      issuerUserId: actorId,
      appId: null,
    },
    select: { id: true },
  });

  if (globalInvites.length === 0) return;

  const redeemLogs = await prisma.auditLog.findMany({
    where: {
      action: "INVITE_REDEEM",
      resourceType: "invite",
      resourceId: { in: globalInvites.map((invite) => invite.id) },
      actorId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { actorId: true },
  });

  const invitedUserIds = Array.from(
    new Set(
      redeemLogs
        .map((log) => log.actorId)
        .filter((userIdFromLog): userIdFromLog is string => Boolean(userIdFromLog) && userIdFromLog !== actorId)
    )
  );

  if (invitedUserIds.length === 0) return;

  const existingMembers = await prisma.appMember.findMany({
    where: {
      appId: managerMember.appId,
      userId: { in: invitedUserIds },
    },
    select: { userId: true },
  });

  const existingUserIds = new Set(existingMembers.map((member) => member.userId));
  const missingUserIds = invitedUserIds.filter((userId) => !existingUserIds.has(userId));
  if (missingUserIds.length === 0) return;

  await prisma.appMember.createMany({
    data: missingUserIds.map((userId) => ({
      appId: managerMember.appId,
      userId,
      role: AppMemberRole.MEMBER,
      parentResellerUserId: actorId,
    })),
    skipDuplicates: true,
  });
}

export async function getPanelSuperiorEmail(actor: SessionUser): Promise<string | null> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || null;

  if (actor.role === PlatformRole.SUPER_ADMIN) {
    return adminEmail ?? actor.email;
  }

  const relation = await prisma.appMember.findFirst({
    where: {
      userId: actor.id,
      parentResellerUserId: { not: null },
      app: { isDeleted: false },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      parentResellerUserId: true,
    },
  });

  if (!relation?.parentResellerUserId) {
    return adminEmail;
  }

  const parentUser = await prisma.user.findUnique({
    where: { id: relation.parentResellerUserId },
    select: {
      email: true,
      role: true,
      appMembers: {
        where: {
          role: { in: [AppMemberRole.OWNER, AppMemberRole.RESELLER] },
          app: { isDeleted: false },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!parentUser) return adminEmail;

  const parentStillManager =
    parentUser.role === PlatformRole.SUPER_ADMIN || parentUser.appMembers.length > 0;

  if (parentStillManager) return parentUser.email;
  return adminEmail;
}

export async function listPanelUsers(actor: SessionUser): Promise<PanelUsersResult> {
  const envAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase() ?? "";

  if (actor.role === PlatformRole.SUPER_ADMIN) {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        wallet: {
          select: {
            pointBalance: true,
          },
        },
        appMembers: {
          where: {
            app: { isDeleted: false },
          },
          select: {
            role: true,
            app: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const items: PanelUserItem[] = [];

    for (const user of users) {
      const base = {
        userId: user.id,
        email: user.email,
        platformRole: user.role,
        isEnvAdmin: Boolean(envAdminEmail && user.email.toLowerCase() === envAdminEmail),
        pointBalance: user.wallet?.pointBalance ?? 0,
      };

      if (user.appMembers.length === 0) {
        items.push({
          ...base,
          appRole: null,
          appId: null,
          appName: null,
        });
        continue;
      }

      for (const member of user.appMembers) {
        items.push({
          ...base,
          appRole: member.role,
          appId: member.app.id,
          appName: member.app.name,
        });
      }
    }

    return {
      scope: "admin",
      items,
    };
  }

  const hasManagerMembership = await prisma.appMember.findFirst({
    where: {
      userId: actor.id,
      role: { in: [AppMemberRole.OWNER, AppMemberRole.RESELLER] },
      app: { isDeleted: false },
    },
    select: { id: true },
  });

  if (!hasManagerMembership) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }

  await repairResellerGlobalInviteMembers(actor.id);

  const members = await prisma.appMember.findMany({
    where: {
      parentResellerUserId: actor.id,
      app: { isDeleted: false },
    },
    orderBy: { createdAt: "desc" },
    select: {
      role: true,
      app: {
        select: {
          id: true,
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          wallet: {
            select: {
              pointBalance: true,
            },
          },
        },
      },
    },
  });

  return {
    scope: "reseller",
    items: members.map((member) => ({
      userId: member.user.id,
      email: member.user.email,
      platformRole: member.user.role,
      isEnvAdmin: Boolean(envAdminEmail && member.user.email.toLowerCase() === envAdminEmail),
      appRole: member.role,
      pointBalance: member.user.wallet?.pointBalance ?? 0,
      appId: member.app.id,
      appName: member.app.name,
    })),
  };
}
