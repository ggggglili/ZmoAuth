import { LicenseStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { createHmac } from "node:crypto";
import type { SessionUser } from "@/lib/auth/session";

export interface UpdateCheckResponse {
  hasUpdate: boolean;
  currentVersion: string;
  targetVersion: string | null;
  strategy: "FORCE" | "OPTIONAL";
  note: string | null;
  offlineTtlSeconds: number;
}

export interface AdminUpdatePolicyItem {
  appId: string;
  offlineTtlSeconds: number;
  forceUpdateMinVersion: string | null;
}

interface UpdatePolicyInput {
  offlineTtlSeconds: number;
  forceUpdateMinVersion?: string | null;
}

const VERSION_PATTERN = /^v?\d+\.\d+\.\d+$/i;

function parseSemver(version: string): [number, number, number] {
  const trimmed = version.trim();
  if (!VERSION_PATTERN.test(trimmed)) {
    throw new AppError("VALIDATION_ERROR", "Version must be in x.y.z format", 400);
  }

  const normalized = trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed;
  const [major, minor, patch] = normalized.split(".").map((value) => Number(value));

  if ([major, minor, patch].some((value) => !Number.isInteger(value) || value < 0)) {
    throw new AppError("VALIDATION_ERROR", "Version must be in x.y.z format", 400);
  }

  return [major, minor, patch];
}

function semverCompare(a: string, b: string): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);

  for (let i = 0; i < 3; i += 1) {
    if (va[i] > vb[i]) return 1;
    if (va[i] < vb[i]) return -1;
  }
  return 0;
}

function isSecretStillInGraceWindow(secret: string | null, expiresAt: Date | null) {
  return Boolean(secret && expiresAt && expiresAt.getTime() > Date.now());
}

async function writeUpdateAuditLog(input: {
  action: "UPDATE_CHECK" | "UPDATE_PACKAGE_FETCH";
  appId: string;
  licenseId?: string | null;
  details: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: input.action,
        resourceType: "app",
        resourceId: input.appId,
        details: {
          appId: input.appId,
          licenseId: input.licenseId ?? null,
          ...input.details,
        },
      },
    });
  } catch {
    // Never break update flow due to audit logging failure.
  }
}

async function ensureActiveApp(appId: string) {
  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: { id: true },
  });
  if (!app) throw new AppError("NOT_FOUND", "App not found", 404);
}

async function requireActiveLicenseForUpdate(appId: string, licenseKey: string) {
  const license = await prisma.license.findUnique({
    where: { licenseKey },
    select: {
      id: true,
      appId: true,
      status: true,
      expiresAt: true,
    },
  });
  if (!license) {
    throw new AppError("NOT_FOUND", "License not found", 404);
  }
  if (license.appId !== appId) {
    throw new AppError("FORBIDDEN", "License does not belong to this app", 403);
  }
  if (license.status !== LicenseStatus.ACTIVE) {
    throw new AppError("FORBIDDEN", "License is not active", 403);
  }
  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    throw new AppError("FORBIDDEN", "License is expired", 403);
  }

  return license;
}

export async function checkForAppUpdate(
  appId: string,
  currentVersion: string,
  licenseKey: string
): Promise<UpdateCheckResponse> {
  const normalizedCurrentVersion = currentVersion.trim();
  const resultStatus = {
    outcome: "DENIED" as "SUCCESS" | "DENIED",
    reason: "" as string,
    targetVersion: null as string | null,
    strategy: null as "FORCE" | "OPTIONAL" | null,
    hasUpdate: false,
  };

  try {
    await ensureActiveApp(appId);
    const license = await requireActiveLicenseForUpdate(appId, licenseKey);
    parseSemver(normalizedCurrentVersion);

    const [versions, policy] = await Promise.all([
      prisma.appVersion.findMany({
        where: { appId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { version: true, releaseNote: true },
      }),
      prisma.appUpdatePolicy.findUnique({
        where: { appId },
        select: {
          offlineTtlSeconds: true,
          forceUpdateMinVersion: true,
        },
      }),
    ]);

    const latest = versions[0];
    if (!latest) {
      resultStatus.outcome = "SUCCESS";
      resultStatus.reason = "NO_RELEASE";
      await writeUpdateAuditLog({
        action: "UPDATE_CHECK",
        appId,
        licenseId: license.id,
        details: {
          resultStatus: resultStatus.reason,
          currentVersion: normalizedCurrentVersion,
          targetVersion: null,
          strategy: "OPTIONAL",
          hasUpdate: false,
        },
      });

      return {
        hasUpdate: false,
        currentVersion: normalizedCurrentVersion,
        targetVersion: null,
        strategy: "OPTIONAL",
        note: null,
        offlineTtlSeconds: policy?.offlineTtlSeconds ?? 900,
      };
    }

    parseSemver(latest.version);
    const hasUpdate = semverCompare(latest.version, normalizedCurrentVersion) > 0;
    if (!hasUpdate) {
      resultStatus.outcome = "SUCCESS";
      resultStatus.reason = "UP_TO_DATE";
      await writeUpdateAuditLog({
        action: "UPDATE_CHECK",
        appId,
        licenseId: license.id,
        details: {
          resultStatus: resultStatus.reason,
          currentVersion: normalizedCurrentVersion,
          targetVersion: latest.version,
          strategy: "OPTIONAL",
          hasUpdate: false,
        },
      });

      return {
        hasUpdate: false,
        currentVersion: normalizedCurrentVersion,
        targetVersion: null,
        strategy: "OPTIONAL",
        note: null,
        offlineTtlSeconds: policy?.offlineTtlSeconds ?? 900,
      };
    }

    const force = Boolean(
      policy?.forceUpdateMinVersion &&
        semverCompare(normalizedCurrentVersion, policy.forceUpdateMinVersion) < 0
    );
    const strategy: "FORCE" | "OPTIONAL" = force ? "FORCE" : "OPTIONAL";

    resultStatus.outcome = "SUCCESS";
    resultStatus.reason = "UPDATE_AVAILABLE";
    resultStatus.targetVersion = latest.version;
    resultStatus.strategy = strategy;
    resultStatus.hasUpdate = true;

    await writeUpdateAuditLog({
      action: "UPDATE_CHECK",
      appId,
      licenseId: license.id,
      details: {
        resultStatus: resultStatus.reason,
        currentVersion: normalizedCurrentVersion,
        targetVersion: latest.version,
        strategy,
        hasUpdate: true,
      },
    });

    return {
      hasUpdate: true,
      currentVersion: normalizedCurrentVersion,
      targetVersion: latest.version,
      strategy,
      note: latest.releaseNote ?? null,
      offlineTtlSeconds: policy?.offlineTtlSeconds ?? 900,
    };
  } catch (error: unknown) {
    const reason = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    await writeUpdateAuditLog({
      action: "UPDATE_CHECK",
      appId,
      details: {
        resultStatus: reason,
        currentVersion: normalizedCurrentVersion,
        targetVersion: resultStatus.targetVersion,
        strategy: resultStatus.strategy,
        hasUpdate: resultStatus.hasUpdate,
      },
    });
    throw error;
  }
}

export async function getUpdatePackage(appId: string, version: string, licenseKey: string) {
  const normalizedVersion = version.trim();
  parseSemver(normalizedVersion);

  let licenseId: string | null = null;

  try {
    await ensureActiveApp(appId);
    const license = await requireActiveLicenseForUpdate(appId, licenseKey);
    licenseId = license.id;

    const record = await prisma.appVersion.findUnique({
      where: { appId_version: { appId, version: normalizedVersion } },
      select: {
        appId: true,
        version: true,
        downloadUrl: true,
        releaseNote: true,
        createdAt: true,
        app: {
          select: {
            updateSignSecret: true,
            previousUpdateSignSecret: true,
            previousUpdateSignSecretExpiresAt: true,
          },
        },
      },
    });

    if (!record) throw new AppError("NOT_FOUND", "Version not found", 404);

    const payloadBase = `${record.appId}:${record.version}:${record.downloadUrl}`;
    const legacySignatureActive = isSecretStillInGraceWindow(
      record.app.previousUpdateSignSecret,
      record.app.previousUpdateSignSecretExpiresAt
    );
    const payload = {
      appId: record.appId,
      version: record.version,
      downloadUrl: record.downloadUrl,
      releaseNote: record.releaseNote,
      signature: createHmac("sha256", record.app.updateSignSecret)
        .update(payloadBase)
        .digest("hex"),
      legacySignature:
        legacySignatureActive && record.app.previousUpdateSignSecret
          ? createHmac("sha256", record.app.previousUpdateSignSecret).update(payloadBase).digest("hex")
          : null,
      signatureGraceExpiresAt:
        legacySignatureActive && record.app.previousUpdateSignSecretExpiresAt
          ? record.app.previousUpdateSignSecretExpiresAt.toISOString()
          : null,
      publishedAt: record.createdAt.toISOString(),
    };

    await writeUpdateAuditLog({
      action: "UPDATE_PACKAGE_FETCH",
      appId,
      licenseId,
      details: {
        resultStatus: "SUCCESS",
        version: normalizedVersion,
      },
    });

    return payload;
  } catch (error: unknown) {
    const reason = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    await writeUpdateAuditLog({
      action: "UPDATE_PACKAGE_FETCH",
      appId,
      licenseId,
      details: {
        resultStatus: reason,
        version: normalizedVersion,
      },
    });
    throw error;
  }
}


export async function getAppUpdatePolicyByAdmin(appId: string): Promise<AdminUpdatePolicyItem> {
  await ensureActiveApp(appId);

  const policy = await prisma.appUpdatePolicy.findUnique({
    where: { appId },
    select: {
      appId: true,
      offlineTtlSeconds: true,
      forceUpdateMinVersion: true,
    },
  });

  if (!policy) {
    return {
      appId,
      offlineTtlSeconds: 900,
      forceUpdateMinVersion: null,
    };
  }

  return policy;
}

export async function upsertAppUpdatePolicyByAdmin(
  actor: SessionUser,
  appId: string,
  input: UpdatePolicyInput
): Promise<AdminUpdatePolicyItem> {
  await ensureActiveApp(appId);
  const normalizedForceUpdateMinVersion = input.forceUpdateMinVersion?.trim()
    ? input.forceUpdateMinVersion.trim()
    : null;
  if (normalizedForceUpdateMinVersion) {
    parseSemver(normalizedForceUpdateMinVersion);
  }

  const previous = await prisma.appUpdatePolicy.findUnique({
    where: { appId },
    select: {
      id: true,
      offlineTtlSeconds: true,
      forceUpdateMinVersion: true,
    },
  });

  const policy = await prisma.appUpdatePolicy.upsert({
    where: { appId },
    update: {
      offlineTtlSeconds: input.offlineTtlSeconds,
      forceUpdateMinVersion: normalizedForceUpdateMinVersion,
    },
    create: {
      appId,
      offlineTtlSeconds: input.offlineTtlSeconds,
      forceUpdateMinVersion: normalizedForceUpdateMinVersion,
    },
    select: {
      id: true,
      appId: true,
      offlineTtlSeconds: true,
      forceUpdateMinVersion: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "APP_UPDATE_POLICY_SET",
      resourceType: "app_update_policy",
      resourceId: policy.id,
      details: {
        appId,
        previous: previous
          ? {
              offlineTtlSeconds: previous.offlineTtlSeconds,
              forceUpdateMinVersion: previous.forceUpdateMinVersion,
            }
          : null,
        current: {
          offlineTtlSeconds: policy.offlineTtlSeconds,
          forceUpdateMinVersion: policy.forceUpdateMinVersion,
        },
      },
    },
  });

  return {
    appId: policy.appId,
    offlineTtlSeconds: policy.offlineTtlSeconds,
    forceUpdateMinVersion: policy.forceUpdateMinVersion,
  };
}
