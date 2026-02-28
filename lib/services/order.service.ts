import {
  AppMemberRole,
  OrderStatus,
  PlanType,
  PlatformRole,
  PointTransactionType,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/session";

function calcBasePoints(
  app: { weekPoints: number; monthPoints: number; yearPoints: number; lifetimePoints: number },
  planType: PlanType
) {
  switch (planType) {
    case PlanType.WEEK:
      return app.weekPoints;
    case PlanType.MONTH:
      return app.monthPoints;
    case PlanType.YEAR:
      return app.yearPoints;
    case PlanType.LIFETIME:
      return app.lifetimePoints;
    default:
      return app.monthPoints;
  }
}

function calcExpiresAt(planType: PlanType) {
  if (planType === PlanType.LIFETIME) return null;

  const now = Date.now();
  if (planType === PlanType.WEEK) return new Date(now + 7 * 24 * 60 * 60 * 1000);
  if (planType === PlanType.MONTH) return new Date(now + 30 * 24 * 60 * 60 * 1000);
  return new Date(now + 365 * 24 * 60 * 60 * 1000);
}

async function getDiscountRate(appId: string, userId: string) {
  const member = await prisma.appMember.findUnique({
    where: { appId_userId: { appId, userId } },
    select: { role: true },
  });

  if (!member || (member.role !== AppMemberRole.RESELLER && member.role !== AppMemberRole.OWNER)) {
    return 1;
  }

  const discount = await prisma.appResellerDiscount.findUnique({
    where: { appId_userId: { appId, userId } },
    select: { discountRate: true },
  });

  return discount ? Number(discount.discountRate) : 1;
}

function generateLicenseKey() {
  return `LIC-${randomUUID().replace(/-/g, "").toUpperCase()}`;
}

async function createLicenseWithRetry(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    userId: string;
    appId: string;
    expiresAt: Date | null;
  }
) {
  for (let i = 0; i < 5; i += 1) {
    try {
      return await tx.license.create({
        data: {
          orderId: input.orderId,
          userId: input.userId,
          appId: input.appId,
          licenseKey: generateLicenseKey(),
          status: "ACTIVE",
          expiresAt: input.expiresAt,
        },
        select: {
          id: true,
          orderId: true,
          appId: true,
          userId: true,
          licenseKey: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError("CONFLICT", "Failed to generate a unique license key", 500);
}

export async function createOrder(
  actor: SessionUser,
  input: { appId: string; planType: PlanType }
) {
  const app = await prisma.app.findFirst({
    where: { id: input.appId, isDeleted: false },
    select: {
      id: true,
      weekPoints: true,
      monthPoints: true,
      yearPoints: true,
      lifetimePoints: true,
    },
  });
  if (!app) throw new AppError("NOT_FOUND", "App not found", 404);

  const basePoints = calcBasePoints(app, input.planType);
  const discountRate = await getDiscountRate(input.appId, actor.id);
  const finalPoints = Math.max(0, Math.round(basePoints * discountRate));

  const order = await prisma.order.create({
    data: {
      userId: actor.id,
      appId: input.appId,
      planType: input.planType,
      basePoints,
      discountRate,
      finalPoints,
      status: OrderStatus.PENDING,
    },
    select: {
      id: true,
      appId: true,
      userId: true,
      planType: true,
      basePoints: true,
      discountRate: true,
      finalPoints: true,
      status: true,
      paidAt: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "ORDER_CREATE",
      resourceType: "order",
      resourceId: order.id,
      details: {
        appId: input.appId,
        planType: input.planType,
        basePoints,
        discountRate,
        finalPoints,
      },
    },
  });

  return {
    ...order,
    discountRate: Number(order.discountRate),
  };
}

export async function payOrder(actor: SessionUser, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        appId: true,
        planType: true,
        finalPoints: true,
        status: true,
      },
    });
    if (!order) throw new AppError("NOT_FOUND", "Order not found", 404);

    if (actor.role !== PlatformRole.SUPER_ADMIN && order.userId !== actor.id) {
      throw new AppError("FORBIDDEN", "Forbidden", 403);
    }

    if (order.status === OrderStatus.PAID) {
      throw new AppError("CONFLICT", "Order has already been paid", 409);
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new AppError("VALIDATION_ERROR", "Order status does not allow payment", 400);
    }

    await tx.wallet.upsert({
      where: { userId: order.userId },
      update: {},
      create: {
        userId: order.userId,
        pointBalance: 0,
      },
    });

    const debit = await tx.wallet.updateMany({
      where: {
        userId: order.userId,
        pointBalance: { gte: order.finalPoints },
      },
      data: {
        pointBalance: { decrement: order.finalPoints },
      },
    });

    if (debit.count !== 1) {
      throw new AppError("INSUFFICIENT_POINTS", "Insufficient points", 400);
    }

    const paidOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
      },
      select: {
        id: true,
        userId: true,
        appId: true,
        planType: true,
        finalPoints: true,
        status: true,
        paidAt: true,
      },
    });

    await tx.pointTransaction.create({
      data: {
        userId: order.userId,
        type: PointTransactionType.PURCHASE,
        amount: -order.finalPoints,
        operatorId: actor.id,
        referenceType: "order",
        referenceId: order.id,
      },
    });

    const license = await createLicenseWithRetry(tx, {
      orderId: order.id,
      userId: order.userId,
      appId: order.appId,
      expiresAt: calcExpiresAt(order.planType),
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "ORDER_PAY",
        resourceType: "order",
        resourceId: order.id,
        details: {
          finalPoints: order.finalPoints,
          licenseId: license.id,
        },
      },
    });

    return {
      order: paidOrder,
      license,
    };
  });
}
