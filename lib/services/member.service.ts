import { AppMemberRole, PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/session";

export async function setAppMemberRoleByAdmin(
  actor: SessionUser,
  appId: string,
  input: {
    userId: string;
    role: AppMemberRole;
    parentResellerUserId?: string | null;
  }
) {
  if (actor.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "无权限操作", 403);
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!user) throw new AppError("NOT_FOUND", "目标用户不存在", 404);

  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: { id: true },
  });
  if (!app) throw new AppError("NOT_FOUND", "应用不存在", 404);

  const previousMember = await prisma.appMember.findUnique({
    where: { appId_userId: { appId, userId: input.userId } },
    select: {
      role: true,
      parentResellerUserId: true,
    },
  });

  if (
    previousMember &&
    previousMember.role === input.role &&
    (previousMember.parentResellerUserId ?? null) === (input.parentResellerUserId ?? null)
  ) {
    throw new AppError("CONFLICT", "角色未发生变化", 409);
  }

  const member = await prisma.appMember.upsert({
    where: {
      appId_userId: { appId, userId: input.userId },
    },
    update: {
      role: input.role,
      parentResellerUserId: input.parentResellerUserId ?? null,
    },
    create: {
      appId,
      userId: input.userId,
      role: input.role,
      parentResellerUserId: input.parentResellerUserId ?? null,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "APP_MEMBER_ROLE_CHANGE",
      resourceType: "app_member",
      resourceId: member.id,
      details: {
        appId,
        userId: input.userId,
        previousRole: previousMember?.role ?? null,
        currentRole: member.role,
        previousParentResellerUserId: previousMember?.parentResellerUserId ?? null,
        currentParentResellerUserId: member.parentResellerUserId ?? null,
      },
    },
  });

  return member;
}

export async function listAppMembersByAdmin(actor: SessionUser, appId: string) {
  if (actor.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "无权限操作", 403);
  }

  return prisma.appMember.findMany({
    where: { appId },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function listChildrenForReseller(actor: SessionUser, appId: string) {
  const member = await prisma.appMember.findUnique({
    where: {
      appId_userId: {
        appId,
        userId: actor.id,
      },
    },
    select: { role: true },
  });
  const isAllowed = actor.role === PlatformRole.SUPER_ADMIN || member?.role === "RESELLER" || member?.role === "OWNER";
  if (!isAllowed) throw new AppError("FORBIDDEN", "无权限操作", 403);

  return prisma.appMember.findMany({
    where: {
      appId,
      parentResellerUserId: actor.id,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
