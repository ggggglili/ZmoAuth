import { BindingTargetType, LicenseStatus, PlanType, PlatformRole, PointTransactionType } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth/session";
import { reserveVerifyNonce } from "@/lib/security/nonce-replay";
import { getSystemSettings } from "@/lib/services/system-settings.service";

const MAX_TIMESTAMP_OFFSET_MS = 5 * 60 * 1000;

function isValidDomain(input: string) {
  return /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(input);
}

function isValidIpv4(input: string) {
  const parts = input.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    if (value < 0 || value > 255) return false;
  }
  return true;
}

function parseIpPort(raw: string) {
  const match = raw.match(/^([0-9.]+)(?::([0-9]{1,5}))?$/);
  if (!match) return null;

  const ip = match[1];
  if (!isValidIpv4(ip)) return null;

  if (!match[2]) return { ip, port: null };

  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return { ip, port };
}

export function normalizeBindTarget(rawTarget: string): {
  targetType: BindingTargetType;
  bindTarget: string;
} {
  const value = rawTarget.trim().toLowerCase();
  if (!value) {
    throw new AppError("VALIDATION_ERROR", "bindTarget is required", 400);
  }

  const parsedIpPort = parseIpPort(value);
  if (parsedIpPort) {
    return {
      targetType: BindingTargetType.IP_PORT,
      bindTarget: parsedIpPort.port ? `${parsedIpPort.ip}:${parsedIpPort.port}` : parsedIpPort.ip,
    };
  }

  if (isValidDomain(value)) {
    return {
      targetType: BindingTargetType.DOMAIN,
      bindTarget: value,
    };
  }

  throw new AppError("VALIDATION_ERROR", "bindTarget must be a valid domain or IP[:port]", 400);
}

function toEffectiveLicenseStatus(
  status: LicenseStatus,
  expiresAt: Date | null
): LicenseStatus {
  if (status === LicenseStatus.REVOKED) return LicenseStatus.REVOKED;
  if (expiresAt && expiresAt.getTime() <= Date.now()) return LicenseStatus.EXPIRED;
  return status;
}

function getRemainingDays(expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) return null;
  const diffMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function signPayload(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function normalizeAuditActorId(actorId?: string | null) {
  if (!actorId) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actorId
    );
  return isUuid ? actorId : null;
}

function getActiveSdkSecretCandidates(app: {
  sdkSecret: string;
  previousSdkSecret: string | null;
  previousSdkSecretExpiresAt: Date | null;
}) {
  const candidates: Array<{ secret: string; source: "CURRENT" | "PREVIOUS" }> = [
    { secret: app.sdkSecret, source: "CURRENT" },
  ];

  if (
    app.previousSdkSecret &&
    app.previousSdkSecretExpiresAt &&
    app.previousSdkSecretExpiresAt.getTime() > Date.now()
  ) {
    candidates.push({ secret: app.previousSdkSecret, source: "PREVIOUS" });
  }

  return candidates;
}

function isHexSignatureMatch(expected: string, received: string) {
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(received, "hex");
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function listLicensesForCurrentUser(actor: SessionUser) {
  const licenses = await prisma.license.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      appId: true,
      licenseKey: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      app: {
        select: {
          id: true,
          name: true,
        },
      },
      bindings: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          targetType: true,
          bindTarget: true,
          boundAt: true,
        },
      },
    },
  });

  return licenses.map((license) => ({
    id: license.id,
    appId: license.appId,
    appName: license.app.name,
    licenseKey: license.licenseKey,
    status: toEffectiveLicenseStatus(license.status, license.expiresAt),
    expiresAt: license.expiresAt,
    createdAt: license.createdAt,
    activeBinding: license.bindings[0] ?? null,
  }));
}

export async function bindLicenseForCurrentUser(
  actor: SessionUser,
  licenseId: string,
  rawBindTarget: string
) {
  const normalized = normalizeBindTarget(rawBindTarget);
  const settings = await getSystemSettings();
  const licenseRebindCostPoints = settings.licenseRebindCostPoints;

  return prisma.$transaction(async (tx) => {
    const license = await tx.license.findUnique({
      where: { id: licenseId },
      select: {
        id: true,
        userId: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!license) throw new AppError("NOT_FOUND", "授权不存在", 404);
    if (actor.role !== PlatformRole.SUPER_ADMIN && actor.id !== license.userId) {
      throw new AppError("FORBIDDEN", "无权限操作该授权", 403);
    }

    const effectiveStatus = toEffectiveLicenseStatus(license.status, license.expiresAt);
    if (effectiveStatus !== LicenseStatus.ACTIVE) {
      throw new AppError("VALIDATION_ERROR", "当前授权状态不可绑定", 400);
    }

    const existing = await tx.licenseBinding.findFirst({
      where: {
        licenseId: license.id,
        isActive: true,
      },
      select: {
        id: true,
        bindTarget: true,
      },
    });

    if (existing?.bindTarget === normalized.bindTarget) {
      const unchangedBinding = await tx.licenseBinding.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          licenseId: true,
          targetType: true,
          bindTarget: true,
          isActive: true,
          boundAt: true,
        },
      });
      if (!unchangedBinding) {
        throw new AppError("NOT_FOUND", "绑定记录不存在", 404);
      }

      return {
        binding: unchangedBinding,
        changed: false,
        isRebind: false,
        chargedPoints: 0,
      };
    }

    const isRebind = Boolean(existing);
    const chargedPoints = isRebind ? licenseRebindCostPoints : 0;

    if (isRebind && chargedPoints > 0) {
      await tx.wallet.upsert({
        where: { userId: license.userId },
        update: {},
        create: {
          userId: license.userId,
          pointBalance: 0,
        },
      });

      const debit = await tx.wallet.updateMany({
        where: {
          userId: license.userId,
          pointBalance: { gte: chargedPoints },
        },
        data: {
          pointBalance: { decrement: chargedPoints },
        },
      });

      if (debit.count !== 1) {
        throw new AppError("INSUFFICIENT_POINTS", "积分不足，无法更换绑定", 400);
      }

      await tx.pointTransaction.create({
        data: {
          userId: license.userId,
          type: PointTransactionType.ADJUST,
          amount: -chargedPoints,
          operatorId: actor.id,
          referenceType: "license_rebind",
          referenceId: license.id,
        },
      });
    }

    await tx.licenseBinding.updateMany({
      where: {
        licenseId: license.id,
        isActive: true,
      },
      data: {
        isActive: false,
        unboundAt: new Date(),
      },
    });

    const binding = await tx.licenseBinding.create({
      data: {
        licenseId: license.id,
        targetType: normalized.targetType,
        bindTarget: normalized.bindTarget,
        isActive: true,
        boundAt: new Date(),
      },
      select: {
        id: true,
        licenseId: true,
        targetType: true,
        bindTarget: true,
        isActive: true,
        boundAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: normalizeAuditActorId(actor.id),
        action: "LICENSE_BIND",
        resourceType: "license",
        resourceId: license.id,
        details: {
          targetType: normalized.targetType,
          bindTarget: normalized.bindTarget,
          previousBindTarget: existing?.bindTarget ?? null,
          mode: isRebind ? "rebind" : "bind",
          chargedPoints,
        },
      },
    });

    return {
      binding,
      changed: true,
      isRebind,
      chargedPoints,
    };
  });
}

export interface VerifyLicenseInput {
  license_key: string;
  bind_target: string;
  timestamp: number;
  nonce: string;
  sign: string;
}

export async function verifyLicense(input: VerifyLicenseInput) {
  const serverTime = new Date().toISOString();

  const normalized = (() => {
    try {
      return normalizeBindTarget(input.bind_target);
    } catch {
      return null;
    }
  })();

  if (!normalized) {
    return {
      valid: false,
      status: "INVALID_BIND_TARGET",
      expires_at: null,
      server_time: serverTime,
      signature: "",
    };
  }

  if (!Number.isFinite(input.timestamp)) {
    return {
      valid: false,
      status: "INVALID_TIMESTAMP",
      expires_at: null,
      server_time: serverTime,
      signature: "",
    };
  }

  const skew = Math.abs(Date.now() - input.timestamp);
  if (skew > MAX_TIMESTAMP_OFFSET_MS) {
    return {
      valid: false,
      status: "TIMESTAMP_OUT_OF_WINDOW",
      expires_at: null,
      server_time: serverTime,
      signature: "",
    };
  }

  if (!input.nonce || input.nonce.length < 8) {
    return {
      valid: false,
      status: "INVALID_NONCE",
      expires_at: null,
      server_time: serverTime,
      signature: "",
    };
  }

  const nonceKey = `verify:${input.license_key}:${input.nonce}:${input.timestamp}`;
  try {
    const nonceAccepted = await reserveVerifyNonce(
      nonceKey,
      Math.max(60, Math.floor(MAX_TIMESTAMP_OFFSET_MS / 1000))
    );
    if (!nonceAccepted) {
      return {
        valid: false,
        status: "NONCE_REPLAY",
        expires_at: null,
        server_time: serverTime,
        signature: "",
      };
    }
  } catch {
    return {
      valid: false,
      status: "NONCE_STORE_ERROR",
      expires_at: null,
      server_time: serverTime,
      signature: "",
    };
  }

  const license = await prisma.license.findUnique({
    where: { licenseKey: input.license_key },
    select: {
      id: true,
      appId: true,
      status: true,
      expiresAt: true,
      app: {
        select: {
          sdkSecret: true,
          previousSdkSecret: true,
          previousSdkSecretExpiresAt: true,
        },
      },
      bindings: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          bindTarget: true,
        },
      },
    },
  });

  if (!license) {
    return {
      valid: false,
      status: "NOT_FOUND",
      expires_at: null,
      server_time: serverTime,
      signature: "",
    };
  }

  const signPayloadRaw = `${input.license_key}${normalized.bindTarget}${input.timestamp}${input.nonce}`;
  const secretCandidates = getActiveSdkSecretCandidates(license.app);
  let matchedSecret: string | null = null;
  let matchedSecretSource: "CURRENT" | "PREVIOUS" | null = null;
  for (const candidate of secretCandidates) {
    const expectedSign = signPayload(candidate.secret, signPayloadRaw);
    if (isHexSignatureMatch(expectedSign, input.sign)) {
      matchedSecret = candidate.secret;
      matchedSecretSource = candidate.source;
      break;
    }
  }

  if (!matchedSecret) {
    return {
      valid: false,
      status: "INVALID_SIGN",
      expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
      server_time: serverTime,
      signature: signPayload(license.app.sdkSecret, `0|INVALID_SIGN|${serverTime}`),
    };
  }

  const activeBinding = license.bindings[0] ?? null;
  const effectiveStatus = toEffectiveLicenseStatus(license.status, license.expiresAt);
  const bindMatched = activeBinding?.bindTarget === normalized.bindTarget;
  const valid = effectiveStatus === LicenseStatus.ACTIVE && bindMatched;
  const status = valid
    ? "ACTIVE"
    : !bindMatched
      ? "BIND_MISMATCH"
      : effectiveStatus;

  const signature = signPayload(
    matchedSecret,
    `${valid ? 1 : 0}|${status}|${license.expiresAt?.toISOString() ?? ""}|${serverTime}`
  );

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "LICENSE_VERIFY",
      resourceType: "license",
      resourceId: license.id,
      details: {
        valid,
        status,
        bindTarget: normalized.bindTarget,
        secretSource: matchedSecretSource,
      },
    },
  });

  return {
    valid,
    status,
    expires_at: license.expiresAt ? license.expiresAt.toISOString() : null,
    server_time: serverTime,
    signature,
  };
}

export async function listLicensesByAdmin(limit = 200) {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 200;

  const licenses = await prisma.license.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      appId: true,
      userId: true,
      licenseKey: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      app: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          email: true,
        },
      },
      bindings: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          targetType: true,
          bindTarget: true,
          boundAt: true,
        },
      },
    },
  });

  return licenses.map((license) => ({
    id: license.id,
    appId: license.appId,
    appName: license.app.name,
    userId: license.userId,
    userEmail: license.user.email,
    licenseKey: license.licenseKey,
    status: license.status,
    effectiveStatus: toEffectiveLicenseStatus(license.status, license.expiresAt),
    expiresAt: license.expiresAt,
    createdAt: license.createdAt,
    activeBinding: license.bindings[0] ?? null,
  }));
}

export type DomainAuthorizationStatus = "AUTHORIZED" | "EXPIRED" | "UNAUTHORIZED";

export interface DomainAuthorizationResult {
  domain: string;
  found: boolean;
  status: DomainAuthorizationStatus;
  expiresAt: string | null;
  remainingDays: number | null;
  isPermanent: boolean;
  appName: string | null;
  licenseType: PlanType | null;
}

export async function queryDomainAuthorization(rawDomain: string): Promise<DomainAuthorizationResult> {
  const normalized = normalizeBindTarget(rawDomain);
  if (normalized.targetType !== BindingTargetType.DOMAIN) {
    throw new AppError("VALIDATION_ERROR", "domain must be a valid domain", 400);
  }

  const now = new Date();
  const bindings = await prisma.licenseBinding.findMany({
    where: {
      targetType: BindingTargetType.DOMAIN,
      bindTarget: normalized.bindTarget,
      isActive: true,
    },
    orderBy: { boundAt: "desc" },
    select: {
      boundAt: true,
      license: {
        select: {
          status: true,
          expiresAt: true,
          app: {
            select: {
              name: true,
            },
          },
          order: {
            select: {
              planType: true,
            },
          },
        },
      },
    },
  });

  if (bindings.length === 0) {
    return {
      domain: normalized.bindTarget,
      found: false,
      status: "UNAUTHORIZED",
      expiresAt: null,
      remainingDays: null,
      isPermanent: false,
      appName: null,
      licenseType: null,
    };
  }

  const scoped = bindings.map((item) => ({
    boundAt: item.boundAt,
    status: toEffectiveLicenseStatus(item.license.status, item.license.expiresAt),
    expiresAt: item.license.expiresAt,
    appName: item.license.app.name,
    licenseType: item.license.order.planType,
  }));

  const activeCandidates = scoped
    .filter((item) => item.status === LicenseStatus.ACTIVE)
    .sort((a, b) => {
      const aPermanent = a.expiresAt ? 0 : 1;
      const bPermanent = b.expiresAt ? 0 : 1;
      if (aPermanent !== bPermanent) return bPermanent - aPermanent;
      const aExpiry = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bExpiry = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aExpiry !== bExpiry) return bExpiry - aExpiry;
      return b.boundAt.getTime() - a.boundAt.getTime();
    });

  if (activeCandidates.length > 0) {
    const winner = activeCandidates[0];
    return {
      domain: normalized.bindTarget,
      found: true,
      status: "AUTHORIZED",
      expiresAt: winner.expiresAt ? winner.expiresAt.toISOString() : null,
      remainingDays: getRemainingDays(winner.expiresAt, now),
      isPermanent: winner.expiresAt === null,
      appName: winner.appName,
      licenseType: winner.licenseType,
    };
  }

  const expiredCandidates = scoped
    .filter((item) => item.status === LicenseStatus.EXPIRED)
    .sort((a, b) => {
      const aExpiry = a.expiresAt?.getTime() ?? 0;
      const bExpiry = b.expiresAt?.getTime() ?? 0;
      if (aExpiry !== bExpiry) return bExpiry - aExpiry;
      return b.boundAt.getTime() - a.boundAt.getTime();
    });

  if (expiredCandidates.length > 0) {
    const winner = expiredCandidates[0];
    return {
      domain: normalized.bindTarget,
      found: true,
      status: "EXPIRED",
      expiresAt: winner.expiresAt ? winner.expiresAt.toISOString() : null,
      remainingDays: 0,
      isPermanent: false,
      appName: winner.appName,
      licenseType: winner.licenseType,
    };
  }

  const latestBinding = scoped.sort((a, b) => b.boundAt.getTime() - a.boundAt.getTime())[0] ?? null;

  return {
    domain: normalized.bindTarget,
    found: true,
    status: "UNAUTHORIZED",
    expiresAt: null,
    remainingDays: null,
    isPermanent: false,
    appName: latestBinding?.appName ?? null,
    licenseType: latestBinding?.licenseType ?? null,
  };
}

export async function setLicenseStatusByAdmin(
  actor: SessionUser,
  licenseId: string,
  targetStatus: "ACTIVE" | "REVOKED"
) {
  if (actor.role !== PlatformRole.SUPER_ADMIN) {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }

  const existing = await prisma.license.findUnique({
    where: { id: licenseId },
    select: {
      id: true,
      appId: true,
      userId: true,
      status: true,
      expiresAt: true,
      app: { select: { name: true } },
      user: { select: { email: true } },
      bindings: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          targetType: true,
          bindTarget: true,
          boundAt: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError("NOT_FOUND", "License not found", 404);
  }

  const updated = await prisma.license.update({
    where: { id: licenseId },
    data: { status: targetStatus },
    select: {
      id: true,
      appId: true,
      userId: true,
      licenseKey: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      app: { select: { name: true } },
      user: { select: { email: true } },
      bindings: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          targetType: true,
          bindTarget: true,
          boundAt: true,
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actor.id),
      action: "LICENSE_STATUS_SET",
      resourceType: "license",
      resourceId: updated.id,
      details: {
        appId: updated.appId,
        userId: updated.userId,
        fromStatus: existing.status,
        toStatus: targetStatus,
      },
    },
  });

  return {
    id: updated.id,
    appId: updated.appId,
    appName: updated.app.name,
    userId: updated.userId,
    userEmail: updated.user.email,
    licenseKey: updated.licenseKey,
    status: updated.status,
    effectiveStatus: toEffectiveLicenseStatus(updated.status, updated.expiresAt),
    expiresAt: updated.expiresAt,
    createdAt: updated.createdAt,
    activeBinding: updated.bindings[0] ?? null,
  };
}
