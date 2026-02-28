import { PlatformRole, PointTransactionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/session";

export interface RechargeCommand {
  targetUserId: string;
  points: number;
  referenceId: string;
}

export async function getWalletByUserId(userId: string) {
  return prisma.wallet.findUnique({
    where: { userId },
    select: { userId: true, pointBalance: true },
  });
}

export async function listPointTransactionsByUserId(userId: string, limit = 50) {
  return prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      amount: true,
      operatorId: true,
      referenceType: true,
      referenceId: true,
      createdAt: true,
    },
  });
}

export async function adminRecharge(actor: SessionUser, input: { userId: string; points: number }) {
  if (actor.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId: input.userId },
      update: { pointBalance: { increment: input.points } },
      create: {
        userId: input.userId,
        pointBalance: input.points,
      },
      select: { userId: true, pointBalance: true },
    });

    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: PointTransactionType.RECHARGE,
        amount: input.points,
        operatorId: actor.id,
        referenceType: "manual",
        referenceId: `admin_recharge:${Date.now()}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "WALLET_RECHARGE",
        resourceType: "wallet",
        resourceId: input.userId,
        details: {
          targetUserId: input.userId,
          points: input.points,
          mode: "admin",
        },
      },
    });

    return wallet;
  });
}

export async function adminDeduct(actor: SessionUser, input: { userId: string; points: number }) {
  if (actor.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }

  return prisma.$transaction(async (tx) => {
    await tx.wallet.upsert({
      where: { userId: input.userId },
      update: {},
      create: {
        userId: input.userId,
        pointBalance: 0,
      },
    });

    const debit = await tx.wallet.updateMany({
      where: {
        userId: input.userId,
        pointBalance: { gte: input.points },
      },
      data: {
        pointBalance: { decrement: input.points },
      },
    });

    if (debit.count !== 1) {
      throw new AppError("INSUFFICIENT_POINTS", "Insufficient points", 400);
    }

    const wallet = await tx.wallet.findUnique({
      where: { userId: input.userId },
      select: { userId: true, pointBalance: true },
    });

    if (!wallet) {
      throw new AppError("NOT_FOUND", "Resource not found", 404);
    }

    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: PointTransactionType.ADJUST,
        amount: -input.points,
        operatorId: actor.id,
        referenceType: "manual",
        referenceId: `admin_deduct:${Date.now()}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "WALLET_DEDUCT",
        resourceType: "wallet",
        resourceId: input.userId,
        details: {
          targetUserId: input.userId,
          points: input.points,
          mode: "admin",
        },
      },
    });

    return wallet;
  });
}

export async function resellerRecharge(
  actor: SessionUser,
  appId: string,
  input: RechargeCommand
) {
  return prisma.$transaction(async (tx) => {
    const operatorMember = await tx.appMember.findUnique({
      where: {
        appId_userId: {
          appId,
          userId: actor.id,
        },
      },
      select: { role: true, userId: true },
    });

    const isAllowed =
      actor.role === PlatformRole.SUPER_ADMIN ||
      operatorMember?.role === "RESELLER" ||
      operatorMember?.role === "OWNER";
    if (!isAllowed) throw new AppError("FORBIDDEN", "Forbidden", 403);

    const targetMember = await tx.appMember.findUnique({
      where: {
        appId_userId: {
          appId,
          userId: input.targetUserId,
        },
      },
      select: { userId: true, parentResellerUserId: true },
    });

    if (!targetMember || targetMember.parentResellerUserId !== actor.id) {
      throw new AppError("FORBIDDEN", "Target user is not under this reseller", 403);
    }

    await Promise.all([
      tx.wallet.upsert({
        where: { userId: actor.id },
        update: {},
        create: {
          userId: actor.id,
          pointBalance: 0,
        },
      }),
      tx.wallet.upsert({
        where: { userId: input.targetUserId },
        update: {},
        create: {
          userId: input.targetUserId,
          pointBalance: 0,
        },
      }),
    ]);

    const debit = await tx.wallet.updateMany({
      where: {
        userId: actor.id,
        pointBalance: { gte: input.points },
      },
      data: {
        pointBalance: { decrement: input.points },
      },
    });
    if (debit.count !== 1) {
      throw new AppError("INSUFFICIENT_POINTS", "Insufficient points", 400);
    }

    await tx.wallet.update({
      where: { userId: input.targetUserId },
      data: {
        pointBalance: { increment: input.points },
      },
    });

    const [outTx, inTx] = await Promise.all([
      tx.pointTransaction.create({
        data: {
          userId: actor.id,
          type: PointTransactionType.TRANSFER_OUT,
          amount: -input.points,
          operatorId: actor.id,
          referenceType: "invite",
          referenceId: input.referenceId,
        },
      }),
      tx.pointTransaction.create({
        data: {
          userId: input.targetUserId,
          type: PointTransactionType.TRANSFER_IN,
          amount: input.points,
          operatorId: actor.id,
          referenceType: "invite",
          referenceId: input.referenceId,
        },
      }),
    ]);

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "WALLET_TRANSFER",
        resourceType: "wallet",
        resourceId: input.targetUserId,
        details: {
          appId,
          fromUserId: actor.id,
          toUserId: input.targetUserId,
          points: input.points,
          transferOutId: outTx.id,
          transferInId: inTx.id,
        },
      },
    });

    return {
      transferOutId: outTx.id,
      transferInId: inTx.id,
    };
  });
}

export async function resellerRechargeByActor(
  actor: SessionUser,
  input: RechargeCommand
) {
  return prisma.$transaction(async (tx) => {
    const managerMembership = await tx.appMember.findFirst({
      where: {
        userId: actor.id,
        role: { in: ["RESELLER", "OWNER"] },
        app: { isDeleted: false },
      },
      select: { id: true },
    });

    const isAllowed = actor.role === PlatformRole.SUPER_ADMIN || Boolean(managerMembership);
    if (!isAllowed) throw new AppError("FORBIDDEN", "Forbidden", 403);

    const targetMember = await tx.appMember.findFirst({
      where: {
        userId: input.targetUserId,
        parentResellerUserId: actor.id,
        app: { isDeleted: false },
      },
      select: { id: true },
    });

    if (!targetMember) {
      throw new AppError("FORBIDDEN", "Target user is not under this reseller", 403);
    }

    await Promise.all([
      tx.wallet.upsert({
        where: { userId: actor.id },
        update: {},
        create: {
          userId: actor.id,
          pointBalance: 0,
        },
      }),
      tx.wallet.upsert({
        where: { userId: input.targetUserId },
        update: {},
        create: {
          userId: input.targetUserId,
          pointBalance: 0,
        },
      }),
    ]);

    const debit = await tx.wallet.updateMany({
      where: {
        userId: actor.id,
        pointBalance: { gte: input.points },
      },
      data: {
        pointBalance: { decrement: input.points },
      },
    });
    if (debit.count !== 1) {
      throw new AppError("INSUFFICIENT_POINTS", "Insufficient points", 400);
    }

    await tx.wallet.update({
      where: { userId: input.targetUserId },
      data: {
        pointBalance: { increment: input.points },
      },
    });

    const [outTx, inTx] = await Promise.all([
      tx.pointTransaction.create({
        data: {
          userId: actor.id,
          type: PointTransactionType.TRANSFER_OUT,
          amount: -input.points,
          operatorId: actor.id,
          referenceType: "invite",
          referenceId: input.referenceId,
        },
      }),
      tx.pointTransaction.create({
        data: {
          userId: input.targetUserId,
          type: PointTransactionType.TRANSFER_IN,
          amount: input.points,
          operatorId: actor.id,
          referenceType: "invite",
          referenceId: input.referenceId,
        },
      }),
    ]);

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "WALLET_TRANSFER",
        resourceType: "wallet",
        resourceId: input.targetUserId,
        details: {
          fromUserId: actor.id,
          toUserId: input.targetUserId,
          points: input.points,
          transferOutId: outTx.id,
          transferInId: inTx.id,
        },
      },
    });

    return {
      transferOutId: outTx.id,
      transferInId: inTx.id,
    };
  });
}

export async function ensureWalletForUser(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, pointBalance: 0 },
  });
}

export function normalizePrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new AppError("NOT_FOUND", "Resource not found", 404);
  }
  throw error;
}
