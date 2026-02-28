import { AppMemberRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

async function ensureActiveApp(appId: string) {
  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: { id: true },
  });
  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }
}

function isDiscountTableMissing(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function isDiscountDelegateMissing(error: unknown) {
  return error instanceof TypeError && /findMany|upsert/i.test(error.message);
}

interface RawDiscountRow {
  appId: string;
  userId: string;
  discountRate: Prisma.Decimal | number | string;
  updatedAt: Date;
}

async function listDiscountsRaw(appId: string) {
  const rows = await prisma.$queryRaw<RawDiscountRow[]>`
    SELECT "appId", "userId", "discountRate", "updatedAt"
    FROM "AppResellerDiscount"
    WHERE "appId" = ${appId}
  `;
  return rows;
}

async function upsertDiscountRaw(appId: string, userId: string, discountRate: number) {
  const rows = await prisma.$queryRaw<RawDiscountRow[]>`
    INSERT INTO "AppResellerDiscount" ("id", "appId", "userId", "discountRate", "createdAt", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${appId}, ${userId}, ${new Prisma.Decimal(discountRate)}, NOW(), NOW())
    ON CONFLICT ("appId", "userId")
    DO UPDATE SET
      "discountRate" = EXCLUDED."discountRate",
      "updatedAt" = NOW()
    RETURNING "appId", "userId", "discountRate", "updatedAt"
  `;

  const row = rows[0];
  return {
    appId: row.appId,
    userId: row.userId,
    discountRate: Number(row.discountRate),
    updatedAt: row.updatedAt,
  };
}

export async function listAppResellerDiscounts(appId: string) {
  await ensureActiveApp(appId);

  const resellers = await prisma.appMember.findMany({
    where: { appId, role: AppMemberRole.RESELLER },
    select: {
      userId: true,
      role: true,
      user: {
        select: {
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let discounts: Array<{ userId: string; discountRate: Prisma.Decimal; updatedAt: Date }> = [];
  try {
    discounts = await prisma.appResellerDiscount.findMany({
      where: { appId },
      select: {
        userId: true,
        discountRate: true,
        updatedAt: true,
      },
    });
  } catch (error: unknown) {
    try {
      const rows = await listDiscountsRaw(appId);
      discounts = rows.map((row) => ({
        userId: row.userId,
        discountRate: new Prisma.Decimal(row.discountRate),
        updatedAt: row.updatedAt,
      }));
    } catch (rawError: unknown) {
      // Read path fallback: keep reseller list available.
      if (
        isDiscountTableMissing(error) ||
        isDiscountTableMissing(rawError) ||
        isDiscountDelegateMissing(error)
      ) {
        discounts = [];
      } else {
        throw rawError;
      }
    }
  }

  const discountMap = new Map(discounts.map((item) => [item.userId, item]));

  return resellers.map((member) => {
    const discount = discountMap.get(member.userId);
    return {
      userId: member.userId,
      email: member.user.email,
      role: member.role,
      discountRate: discount ? Number(discount.discountRate) : 1,
      updatedAt: discount?.updatedAt ?? null,
    };
  });
}

export async function setAppResellerDiscount(
  appId: string,
  userId: string,
  discountRate: number,
  actorId?: string
) {
  await ensureActiveApp(appId);

  const member = await prisma.appMember.findUnique({
    where: { appId_userId: { appId, userId } },
    select: { role: true },
  });

  if (!member || member.role !== AppMemberRole.RESELLER) {
    throw new AppError("FORBIDDEN", "Target user is not a reseller in this app", 403);
  }

  const previous = await prisma.appResellerDiscount.findUnique({
    where: { appId_userId: { appId, userId } },
    select: { id: true, discountRate: true },
  });

  try {
    const record = await prisma.appResellerDiscount.upsert({
      where: { appId_userId: { appId, userId } },
      update: { discountRate },
      create: { appId, userId, discountRate },
      select: {
        appId: true,
        userId: true,
        discountRate: true,
        updatedAt: true,
      },
    });

    const result = {
      appId: record.appId,
      userId: record.userId,
      discountRate: Number(record.discountRate),
      updatedAt: record.updatedAt,
    };

    await prisma.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: "APP_RESELLER_DISCOUNT_SET",
        resourceType: "app_reseller_discount",
        resourceId: previous?.id ?? `${appId}:${userId}`,
        details: {
          appId,
          userId,
          previousDiscountRate: previous ? Number(previous.discountRate) : null,
          currentDiscountRate: result.discountRate,
        },
      },
    });

    return result;
  } catch (error: unknown) {
    if (isDiscountTableMissing(error)) {
      throw new AppError("NOT_FOUND", "折扣功能未初始化，请先执行数据库迁移", 500);
    }
    if (isDiscountDelegateMissing(error)) {
      try {
        const result = await upsertDiscountRaw(appId, userId, discountRate);

        await prisma.auditLog.create({
          data: {
            actorId: actorId ?? null,
            action: "APP_RESELLER_DISCOUNT_SET",
            resourceType: "app_reseller_discount",
            resourceId: previous?.id ?? `${appId}:${userId}`,
            details: {
              appId,
              userId,
              previousDiscountRate: previous ? Number(previous.discountRate) : null,
              currentDiscountRate: result.discountRate,
            },
          },
        });

        return result;
      } catch (rawError: unknown) {
        if (isDiscountTableMissing(rawError)) {
          throw new AppError("NOT_FOUND", "折扣功能未初始化，请先执行数据库迁移", 500);
        }
        throw rawError;
      }
    }
    throw error;
  }
}


