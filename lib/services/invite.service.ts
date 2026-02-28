import { AppMemberRole, InviteIssuerType, PlatformRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/session";

const DEFAULT_MAX_USES = 10;
const DEFAULT_EXPIRES_DAYS = 7;

function createCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}

export interface InviteValidationResult {
  valid: boolean;
  reason?: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "MAX_USES_REACHED";
  remainingUses?: number;
  expiresAt?: string;
}

export async function validateInviteCode(code: string): Promise<InviteValidationResult> {
  const invite = await prisma.invite.findUnique({
    where: { code },
    select: { code: true, isRevoked: true, expiresAt: true, maxUses: true, usedCount: true },
  });

  if (!invite) return { valid: false, reason: "NOT_FOUND" };
  if (invite.isRevoked) return { valid: false, reason: "REVOKED" };
  if (invite.expiresAt.getTime() <= Date.now()) return { valid: false, reason: "EXPIRED" };
  if (invite.usedCount >= invite.maxUses) return { valid: false, reason: "MAX_USES_REACHED" };

  return {
    valid: true,
    remainingUses: invite.maxUses - invite.usedCount,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function createAdminInvite(
  actor: SessionUser,
  input: { maxUses?: number; expiresInDays?: number }
) {
  if (actor.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }
  return createInvite({
    issuerType: InviteIssuerType.SUPER_ADMIN,
    issuerUserId: actor.id,
    appId: null,
    maxUses: input.maxUses ?? DEFAULT_MAX_USES,
    expiresInDays: input.expiresInDays ?? DEFAULT_EXPIRES_DAYS,
  });
}

export async function createResellerInvite(
  actor: SessionUser,
  appId: string,
  input: { maxUses?: number; expiresInDays?: number }
) {
  const member = await prisma.appMember.findUnique({
    where: { appId_userId: { appId, userId: actor.id } },
    select: { role: true },
  });

  const isAllowed = actor.role === PlatformRole.SUPER_ADMIN || member?.role === "RESELLER" || member?.role === "OWNER";
  if (!isAllowed) throw new AppError("FORBIDDEN", "Forbidden", 403);

  return createInvite({
    issuerType: InviteIssuerType.RESELLER,
    issuerUserId: actor.id,
    appId,
    maxUses: input.maxUses ?? DEFAULT_MAX_USES,
    expiresInDays: input.expiresInDays ?? DEFAULT_EXPIRES_DAYS,
  });
}

export async function createResellerGlobalInvite(
  actor: SessionUser,
  input: { maxUses?: number; expiresInDays?: number }
) {
  const member = await prisma.appMember.findFirst({
    where: {
      userId: actor.id,
      role: "RESELLER",
      app: { isDeleted: false },
    },
    select: { id: true },
  });

  const isAllowed = actor.role === PlatformRole.SUPER_ADMIN || Boolean(member);
  if (!isAllowed) throw new AppError("FORBIDDEN", "Forbidden", 403);

  return createInvite({
    issuerType: InviteIssuerType.RESELLER,
    issuerUserId: actor.id,
    appId: null,
    maxUses: input.maxUses ?? DEFAULT_MAX_USES,
    expiresInDays: input.expiresInDays ?? DEFAULT_EXPIRES_DAYS,
  });
}

async function createInvite(input: {
  issuerType: InviteIssuerType;
  issuerUserId: string;
  appId: string | null;
  maxUses: number;
  expiresInDays: number;
}) {
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const invite = await tx.invite.create({
      data: {
        code: createCode(),
        issuerType: input.issuerType,
        issuerUserId: input.issuerUserId,
        appId: input.appId,
        maxUses: input.maxUses,
        expiresAt,
      },
      select: {
        id: true,
        code: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        appId: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.issuerUserId,
        action: "INVITE_CREATE",
        resourceType: "invite",
        resourceId: invite.id,
        details: {
          code: invite.code,
          issuerType: input.issuerType,
          appId: input.appId,
          maxUses: input.maxUses,
          expiresAt: invite.expiresAt.toISOString(),
        },
      },
    });

    return invite;
  });
}

async function resolveInviteAppId(
  tx: Prisma.TransactionClient,
  invite: {
    appId: string | null;
    issuerType: InviteIssuerType;
    issuerUserId: string;
  }
) {
  if (invite.appId) return invite.appId;
  if (invite.issuerType !== InviteIssuerType.RESELLER) return null;

  const issuerMember = await tx.appMember.findFirst({
    where: {
      userId: invite.issuerUserId,
      role: AppMemberRole.RESELLER,
      app: { isDeleted: false },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { appId: true },
  });

  return issuerMember?.appId ?? null;
}

export async function registerWithInvite(input: {
  email: string;
  passwordHash: string;
  inviteCode: string;
}) {
  const email = input.email.toLowerCase();

  try {
    return await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (exists) {
        throw new AppError("CONFLICT", "Email already exists", 409);
      }

      const invite = await tx.invite.findUnique({
        where: { code: input.inviteCode },
      });
      if (!invite) throw new AppError("INVITE_INVALID", "Invite invalid: NOT_FOUND", 400);
      if (invite.isRevoked) throw new AppError("INVITE_INVALID", "Invite invalid: REVOKED", 400);
      if (invite.expiresAt.getTime() <= Date.now()) throw new AppError("INVITE_INVALID", "Invite invalid: EXPIRED", 400);

      // Atomic consume guard against concurrent over-use.
      const consume = await tx.invite.updateMany({
        where: {
          id: invite.id,
          isRevoked: false,
          expiresAt: { gt: new Date() },
          usedCount: { lt: invite.maxUses },
        },
        data: {
          usedCount: { increment: 1 },
        },
      });
      if (consume.count !== 1) {
        throw new AppError("MAX_USES_REACHED", "Invite invalid: MAX_USES_REACHED", 400);
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash: input.passwordHash,
          role: "USER",
          wallet: {
            create: {
              pointBalance: 0,
            },
          },
        },
        select: { id: true, email: true, role: true },
      });

      const relationAppId = await resolveInviteAppId(tx, {
        appId: invite.appId,
        issuerType: invite.issuerType,
        issuerUserId: invite.issuerUserId,
      });

      if (relationAppId) {
        await tx.appMember.upsert({
          where: {
            appId_userId: {
              appId: relationAppId,
              userId: user.id,
            },
          },
          update: {
            role: "MEMBER",
            parentResellerUserId: invite.issuerType === InviteIssuerType.RESELLER ? invite.issuerUserId : null,
          },
          create: {
            appId: relationAppId,
            userId: user.id,
            role: "MEMBER",
            parentResellerUserId: invite.issuerType === InviteIssuerType.RESELLER ? invite.issuerUserId : null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "INVITE_REDEEM",
          resourceType: "invite",
          resourceId: invite.id,
          details: {
            code: invite.code,
            appId: invite.appId,
            issuerType: invite.issuerType,
            issuerUserId: invite.issuerUserId,
          },
        },
      });

      return user;
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "Email already exists", 409);
    }
    throw error;
  }
}

export async function listInvitesByAdmin(limit = 20) {
  return prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      code: true,
      issuerType: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      isRevoked: true,
      createdAt: true,
      appId: true,
    },
  });
}

export async function listInvitesByReseller(appId: string, resellerUserId: string, limit = 20) {
  return prisma.invite.findMany({
    where: {
      appId,
      issuerType: InviteIssuerType.RESELLER,
      issuerUserId: resellerUserId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      code: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      isRevoked: true,
      createdAt: true,
    },
  });
}

export async function listInvitesByResellerIssuer(resellerUserId: string, limit = 20) {
  return prisma.invite.findMany({
    where: {
      issuerType: InviteIssuerType.RESELLER,
      issuerUserId: resellerUserId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      code: true,
      issuerType: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      isRevoked: true,
      createdAt: true,
      appId: true,
    },
  });
}

export interface InviteRedeemRecord {
  code: string;
  userEmail: string;
  redeemedAt: string;
}

export interface LatestInviteInfo {
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  isRevoked: boolean;
  createdAt: string;
}

function getCodeFromDetails(details: unknown) {
  if (!details || typeof details !== "object") return null;
  const raw = details as Record<string, unknown>;
  return typeof raw.code === "string" && raw.code ? raw.code : null;
}

export async function getLatestInviteByIssuer(
  issuerType: InviteIssuerType,
  issuerUserId: string
): Promise<LatestInviteInfo | null> {
  const invite = await prisma.invite.findFirst({
    where: {
      issuerType,
      issuerUserId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      code: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      isRevoked: true,
      createdAt: true,
    },
  });

  if (!invite) return null;

  return {
    code: invite.code,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    expiresAt: invite.expiresAt.toISOString(),
    isRevoked: invite.isRevoked,
    createdAt: invite.createdAt.toISOString(),
  };
}

export async function listInviteRedeemRecordsByAdmin(limit = 100): Promise<InviteRedeemRecord[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: "INVITE_REDEEM",
      resourceType: "invite",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      createdAt: true,
      details: true,
      actor: {
        select: {
          email: true,
        },
      },
    },
  });

  return logs
    .map((log) => {
      const code = getCodeFromDetails(log.details);
      if (!code) return null;
      return {
        code,
        userEmail: log.actor?.email ?? "-",
        redeemedAt: log.createdAt.toISOString(),
      };
    })
    .filter((item): item is InviteRedeemRecord => Boolean(item));
}

export async function listInviteRedeemRecordsByReseller(
  appId: string,
  resellerUserId: string,
  limit = 100
): Promise<InviteRedeemRecord[]> {
  const invites = await prisma.invite.findMany({
    where: {
      appId,
      issuerType: InviteIssuerType.RESELLER,
      issuerUserId: resellerUserId,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (invites.length === 0) return [];

  const codeMap = new Map(invites.map((invite) => [invite.id, invite.code]));
  const inviteIds = invites.map((invite) => invite.id);

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "INVITE_REDEEM",
      resourceType: "invite",
      resourceId: { in: inviteIds },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      resourceId: true,
      createdAt: true,
      details: true,
      actor: {
        select: {
          email: true,
        },
      },
    },
  });

  return logs
    .map((log) => {
      const codeFromMap = log.resourceId ? codeMap.get(log.resourceId) : null;
      const code = codeFromMap ?? getCodeFromDetails(log.details);
      if (!code) return null;
      return {
        code,
        userEmail: log.actor?.email ?? "-",
        redeemedAt: log.createdAt.toISOString(),
      };
    })
    .filter((item): item is InviteRedeemRecord => Boolean(item));
}

export async function listInviteRedeemRecordsByResellerIssuer(
  resellerUserId: string,
  limit = 100
): Promise<InviteRedeemRecord[]> {
  const invites = await prisma.invite.findMany({
    where: {
      issuerType: InviteIssuerType.RESELLER,
      issuerUserId: resellerUserId,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (invites.length === 0) return [];

  const codeMap = new Map(invites.map((invite) => [invite.id, invite.code]));
  const inviteIds = invites.map((invite) => invite.id);

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "INVITE_REDEEM",
      resourceType: "invite",
      resourceId: { in: inviteIds },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      resourceId: true,
      createdAt: true,
      details: true,
      actor: {
        select: {
          email: true,
        },
      },
    },
  });

  return logs
    .map((log) => {
      const codeFromMap = log.resourceId ? codeMap.get(log.resourceId) : null;
      const code = codeFromMap ?? getCodeFromDetails(log.details);
      if (!code) return null;
      return {
        code,
        userEmail: log.actor?.email ?? "-",
        redeemedAt: log.createdAt.toISOString(),
      };
    })
    .filter((item): item is InviteRedeemRecord => Boolean(item));
}

export async function listInviteRedeemRecordsByIssuer(
  issuerType: InviteIssuerType,
  issuerUserId: string,
  limit = 100
): Promise<InviteRedeemRecord[]> {
  const invites = await prisma.invite.findMany({
    where: {
      issuerType,
      issuerUserId,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (invites.length === 0) return [];

  const codeMap = new Map(invites.map((invite) => [invite.id, invite.code]));
  const inviteIds = invites.map((invite) => invite.id);

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "INVITE_REDEEM",
      resourceType: "invite",
      resourceId: { in: inviteIds },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      resourceId: true,
      createdAt: true,
      details: true,
      actor: {
        select: {
          email: true,
        },
      },
    },
  });

  return logs
    .map((log) => {
      const codeFromMap = log.resourceId ? codeMap.get(log.resourceId) : null;
      const code = codeFromMap ?? getCodeFromDetails(log.details);
      if (!code) return null;
      return {
        code,
        userEmail: log.actor?.email ?? "-",
        redeemedAt: log.createdAt.toISOString(),
      };
    })
    .filter((item): item is InviteRedeemRecord => Boolean(item));
}
