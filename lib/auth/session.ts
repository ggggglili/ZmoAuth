import { AppMemberRole, PlatformRole } from "@prisma/client";
import { getAuthSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

export interface SessionUser {
  id: string;
  email: string;
  role: PlatformRole;
}

async function ensureSessionUserPersisted(user: SessionUser): Promise<SessionUser> {
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (existing) {
    return existing;
  }

  if (user.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminPasswordHash) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const restoredAdmin = await prisma.user.upsert({
    where: { email: user.email.toLowerCase() },
    update: {
      role: PlatformRole.SUPER_ADMIN,
      passwordHash: adminPasswordHash,
    },
    create: {
      id: user.id,
      email: user.email.toLowerCase(),
      passwordHash: adminPasswordHash,
      role: PlatformRole.SUPER_ADMIN,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: restoredAdmin.id },
    update: {},
    create: {
      userId: restoredAdmin.id,
      pointBalance: 0,
    },
  });

  return restoredAdmin;
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.email || !session.user.role) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  if (session.user.id === "ENV_ADMIN" && session.user.role === PlatformRole.SUPER_ADMIN) {
    const adminEmail = session.user.email.toLowerCase();
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminPasswordHash) {
      throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
    }

    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        role: PlatformRole.SUPER_ADMIN,
        passwordHash: adminPasswordHash,
      },
      create: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: PlatformRole.SUPER_ADMIN,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: adminUser.id },
      update: {},
      create: {
        userId: adminUser.id,
        pointBalance: 0,
      },
    });

    return {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    };
  }

  return ensureSessionUserPersisted({
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  });
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (user.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }
  return user;
}

export async function requireResellerInApp(appId: string) {
  const user = await requireSessionUser();
  if (user.role === PlatformRole.SUPER_ADMIN) {
    return {
      user,
      member: {
        appId,
        userId: user.id,
        role: AppMemberRole.OWNER,
        parentResellerUserId: null,
      },
    };
  }

  const member = await prisma.appMember.findUnique({
    where: {
      appId_userId: {
        appId,
        userId: user.id,
      },
    },
  });

  if (!member || (member.role !== AppMemberRole.RESELLER && member.role !== AppMemberRole.OWNER)) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }

  return { user, member };
}
