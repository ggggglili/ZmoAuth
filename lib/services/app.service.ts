import { AppMemberRole, PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/auth/session";

export async function getUserAppMemberships(user: SessionUser) {
  if (user.role === PlatformRole.SUPER_ADMIN) {
    const apps = await prisma.app.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    });
    return apps.map((app) => ({ appId: app.id, appName: app.name, role: "OWNER" as const }));
  }

  const members = await prisma.appMember.findMany({
    where: { userId: user.id },
    include: { app: { select: { id: true, name: true, isDeleted: true } } },
    orderBy: { createdAt: "desc" },
  });
  return members
    .filter((m) => !m.app.isDeleted)
    .map((m) => ({
      appId: m.app.id,
      appName: m.app.name,
      role: m.role,
    }));
}

type UserRoleInApp = AppMemberRole | "NONE";

export interface PurchasableAppItem {
  id: string;
  name: string;
  description: string | null;
  downloadUrl: string | null;
  basePoints: {
    week: number;
    month: number;
    year: number;
    lifetime: number;
  };
  discountRate: number;
  finalPoints: {
    week: number;
    month: number;
    year: number;
    lifetime: number;
  };
  userRoleInApp: UserRoleInApp;
}

export async function listPurchasableAppsForUser(user: SessionUser): Promise<PurchasableAppItem[]> {
  const appsPromise = prisma.app.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      downloadUrl: true,
      weekPoints: true,
      monthPoints: true,
      yearPoints: true,
      lifetimePoints: true,
    },
  });

  const membershipsPromise = prisma.appMember.findMany({
    where: { userId: user.id },
    select: {
      appId: true,
      role: true,
    },
  });

  const discountsPromise = prisma.appResellerDiscount.findMany({
    where: { userId: user.id },
    select: {
      appId: true,
      discountRate: true,
    },
  });

  const [apps, memberships, discounts] = await Promise.all([
    appsPromise,
    membershipsPromise,
    discountsPromise,
  ]);

  const memberMap = new Map(memberships.map((item) => [item.appId, item.role]));
  const discountMap = new Map(discounts.map((item) => [item.appId, Number(item.discountRate)]));

  return apps.map((app) => {
    const roleInApp: UserRoleInApp =
      user.role === PlatformRole.SUPER_ADMIN ? AppMemberRole.OWNER : (memberMap.get(app.id) ?? "NONE");

    const rawDiscount =
      roleInApp === AppMemberRole.OWNER || roleInApp === AppMemberRole.RESELLER
        ? discountMap.get(app.id) ?? 1
        : 1;
    const discountRate = rawDiscount > 0 && rawDiscount <= 1 ? rawDiscount : 1;

    return {
      id: app.id,
      name: app.name,
      description: app.description,
      downloadUrl: app.downloadUrl,
      basePoints: {
        week: app.weekPoints,
        month: app.monthPoints,
        year: app.yearPoints,
        lifetime: app.lifetimePoints,
      },
      discountRate,
      finalPoints: {
        week: Math.round(app.weekPoints * discountRate),
        month: Math.round(app.monthPoints * discountRate),
        year: Math.round(app.yearPoints * discountRate),
        lifetime: Math.round(app.lifetimePoints * discountRate),
      },
      userRoleInApp: roleInApp,
    };
  });
}
