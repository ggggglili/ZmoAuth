import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

export interface AppPayload {
  name: string;
  description?: string | null;
  downloadUrl?: string | null;
  weekPoints: number;
  monthPoints: number;
  yearPoints: number;
  lifetimePoints: number;
}

export interface AppVersionPayload {
  version: string;
  downloadUrl: string;
  releaseNote?: string | null;
}

export type RotateSecretTarget = "SDK_SECRET" | "UPDATE_SIGN_SECRET" | "BOTH";

export interface AppSdkInfo {
  appId: string;
  appName: string;
  sdkKey: string;
  sdkSecretPreview: string;
  updateSignSecretPreview: string;
  previousSdkSecretPreview: string | null;
  previousSdkSecretExpiresAt: string | null;
  previousUpdateSignSecretPreview: string | null;
  previousUpdateSignSecretExpiresAt: string | null;
}

const SECRET_ROTATION_GRACE_HOURS = 24;

function maskSecret(secret: string) {
  if (!secret) return "******";
  if (secret.length <= 12) return `${secret.slice(0, 2)}****${secret.slice(-2)}`;
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

function normalizeAuditActorId(actorId?: string | null) {
  if (!actorId) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actorId
    );
  return isUuid ? actorId : null;
}

async function ensureActiveApp(appId: string) {
  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: { id: true },
  });
  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }
}

function normalizeAppPayload(input: AppPayload) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    downloadUrl: input.downloadUrl?.trim() ? input.downloadUrl.trim() : null,
    weekPoints: input.weekPoints,
    monthPoints: input.monthPoints,
    yearPoints: input.yearPoints,
    lifetimePoints: input.lifetimePoints,
  };
}

export async function listApps(options?: { includeDeleted?: boolean }) {
  const includeDeleted = options?.includeDeleted ?? false;

  return prisma.app.findMany({
    where: includeDeleted ? {} : { isDeleted: false },
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
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          versions: true,
          members: true,
        },
      },
    },
  });
}

export async function getAppById(appId: string) {
  const app = await prisma.app.findUnique({
    where: { id: appId },
    select: {
      id: true,
      name: true,
      description: true,
      downloadUrl: true,
      weekPoints: true,
      monthPoints: true,
      yearPoints: true,
      lifetimePoints: true,
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }

  return app;
}

export async function createApp(input: AppPayload, actorId?: string) {
  const app = await prisma.app.create({
    data: normalizeAppPayload(input),
    select: {
      id: true,
      name: true,
      description: true,
      downloadUrl: true,
      weekPoints: true,
      monthPoints: true,
      yearPoints: true,
      lifetimePoints: true,
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_CREATE",
      resourceType: "app",
      resourceId: app.id,
      details: {
        name: app.name,
        weekPoints: app.weekPoints,
        monthPoints: app.monthPoints,
        yearPoints: app.yearPoints,
        lifetimePoints: app.lifetimePoints,
      },
    },
  });

  return app;
}

export async function updateApp(appId: string, input: Partial<AppPayload>, actorId?: string) {
  await ensureActiveApp(appId);

  const data: Prisma.AppUpdateInput = {};
  if (typeof input.name !== "undefined") data.name = input.name.trim();
  if (typeof input.description !== "undefined") data.description = input.description?.trim() ? input.description.trim() : null;
  if (typeof input.downloadUrl !== "undefined") data.downloadUrl = input.downloadUrl?.trim() ? input.downloadUrl.trim() : null;
  if (typeof input.weekPoints !== "undefined") data.weekPoints = input.weekPoints;
  if (typeof input.monthPoints !== "undefined") data.monthPoints = input.monthPoints;
  if (typeof input.yearPoints !== "undefined") data.yearPoints = input.yearPoints;
  if (typeof input.lifetimePoints !== "undefined") data.lifetimePoints = input.lifetimePoints;

  const app = await prisma.app.update({
    where: { id: appId },
    data,
    select: {
      id: true,
      name: true,
      description: true,
      downloadUrl: true,
      weekPoints: true,
      monthPoints: true,
      yearPoints: true,
      lifetimePoints: true,
      isDeleted: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_UPDATE",
      resourceType: "app",
      resourceId: app.id,
      details: {
        changedFields: Object.keys(input),
      },
    },
  });

  return app;
}

export async function softDeleteApp(appId: string, actorId?: string) {
  const app = await prisma.app.findUnique({
    where: { id: appId },
    select: { id: true, isDeleted: true },
  });
  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }
  if (app.isDeleted) {
    return { id: appId, isDeleted: true };
  }

  const updated = await prisma.app.update({
    where: { id: appId },
    data: { isDeleted: true },
    select: { id: true, isDeleted: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_SOFT_DELETE",
      resourceType: "app",
      resourceId: appId,
      details: {
        isDeleted: true,
      },
    },
  });

  return updated;
}

export async function listAppVersions(appId: string) {
  await ensureActiveApp(appId);
  return prisma.appVersion.findMany({
    where: { appId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      appId: true,
      version: true,
      downloadUrl: true,
      releaseNote: true,
      createdAt: true,
    },
  });
}

export async function createAppVersion(appId: string, input: AppVersionPayload, actorId?: string) {
  await ensureActiveApp(appId);
  try {
    const version = await prisma.appVersion.create({
      data: {
        appId,
        version: input.version.trim(),
        downloadUrl: input.downloadUrl.trim(),
        releaseNote: input.releaseNote?.trim() ? input.releaseNote.trim() : null,
      },
      select: {
        id: true,
        appId: true,
        version: true,
        downloadUrl: true,
        releaseNote: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: normalizeAuditActorId(actorId),
        action: "APP_VERSION_CREATE",
        resourceType: "app_version",
        resourceId: version.id,
        details: {
          appId,
          version: version.version,
          downloadUrl: version.downloadUrl,
        },
      },
    });

    return version;
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "Version already exists", 409);
    }
    throw error;
  }
}

export async function updateAppVersion(
  appId: string,
  versionId: string,
  input: { downloadUrl?: string; releaseNote?: string | null },
  actorId?: string
) {
  await ensureActiveApp(appId);

  const existing = await prisma.appVersion.findFirst({
    where: { id: versionId, appId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Version not found", 404);
  }

  const version = await prisma.appVersion.update({
    where: { id: versionId },
    data: {
      ...(typeof input.downloadUrl !== "undefined" ? { downloadUrl: input.downloadUrl.trim() } : {}),
      ...(typeof input.releaseNote !== "undefined"
        ? { releaseNote: input.releaseNote?.trim() ? input.releaseNote.trim() : null }
        : {}),
    },
    select: {
      id: true,
      appId: true,
      version: true,
      downloadUrl: true,
      releaseNote: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_VERSION_UPDATE",
      resourceType: "app_version",
      resourceId: version.id,
      details: {
        appId,
        changedFields: Object.keys(input).filter((key) => typeof input[key as keyof typeof input] !== "undefined"),
      },
    },
  });

  return version;
}

export async function deleteAppVersion(appId: string, versionId: string, actorId?: string) {
  await ensureActiveApp(appId);

  const existing = await prisma.appVersion.findFirst({
    where: { id: versionId, appId },
    select: { id: true, version: true },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Version not found", 404);
  }

  const result = await prisma.appVersion.deleteMany({
    where: { id: versionId, appId },
  });

  if (result.count !== 1) {
    throw new AppError("NOT_FOUND", "Version not found", 404);
  }

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_VERSION_DELETE",
      resourceType: "app_version",
      resourceId: versionId,
      details: {
        appId,
        version: existing.version,
      },
    },
  });

  return { id: versionId, deleted: true };
}

export async function getAppSdkInfoByAdmin(appId: string): Promise<AppSdkInfo> {
  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: {
      id: true,
      name: true,
      sdkKey: true,
      sdkSecret: true,
      previousSdkSecret: true,
      previousSdkSecretExpiresAt: true,
      updateSignSecret: true,
      previousUpdateSignSecret: true,
      previousUpdateSignSecretExpiresAt: true,
    },
  });
  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }

  return {
    appId: app.id,
    appName: app.name,
    sdkKey: app.sdkKey,
    sdkSecretPreview: maskSecret(app.sdkSecret),
    updateSignSecretPreview: maskSecret(app.updateSignSecret),
    previousSdkSecretPreview: app.previousSdkSecret ? maskSecret(app.previousSdkSecret) : null,
    previousSdkSecretExpiresAt: app.previousSdkSecretExpiresAt
      ? app.previousSdkSecretExpiresAt.toISOString()
      : null,
    previousUpdateSignSecretPreview: app.previousUpdateSignSecret
      ? maskSecret(app.previousUpdateSignSecret)
      : null,
    previousUpdateSignSecretExpiresAt: app.previousUpdateSignSecretExpiresAt
      ? app.previousUpdateSignSecretExpiresAt.toISOString()
      : null,
  };
}

export async function rotateAppSecretsByAdmin(
  appId: string,
  target: RotateSecretTarget,
  actorId: string
) {
  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: { id: true, sdkSecret: true, updateSignSecret: true },
  });
  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }

  const nextSdkSecret =
    target === "SDK_SECRET" || target === "BOTH" ? randomBytes(32).toString("hex") : null;
  const nextUpdateSignSecret =
    target === "UPDATE_SIGN_SECRET" || target === "BOTH"
      ? randomBytes(32).toString("hex")
      : null;

  const graceExpiresAt = new Date(Date.now() + SECRET_ROTATION_GRACE_HOURS * 60 * 60 * 1000);

  const updated = await prisma.app.update({
    where: { id: appId },
    data: {
      ...(nextSdkSecret
        ? {
            sdkSecret: nextSdkSecret,
            previousSdkSecret: app.sdkSecret,
            previousSdkSecretExpiresAt: graceExpiresAt,
          }
        : {}),
      ...(nextUpdateSignSecret
        ? {
            updateSignSecret: nextUpdateSignSecret,
            previousUpdateSignSecret: app.updateSignSecret,
            previousUpdateSignSecretExpiresAt: graceExpiresAt,
          }
        : {}),
    },
    select: {
      id: true,
      sdkKey: true,
      sdkSecret: true,
      previousSdkSecret: true,
      previousSdkSecretExpiresAt: true,
      updateSignSecret: true,
      previousUpdateSignSecret: true,
      previousUpdateSignSecretExpiresAt: true,
      updatedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_SECRET_ROTATE",
      resourceType: "app",
      resourceId: appId,
      details: {
        target,
        rotated: {
          sdkSecret: Boolean(nextSdkSecret),
          updateSignSecret: Boolean(nextUpdateSignSecret),
        },
        graceHours: SECRET_ROTATION_GRACE_HOURS,
        graceExpiresAt: graceExpiresAt.toISOString(),
      },
    },
  });

  return {
    appId: updated.id,
    sdkKey: updated.sdkKey,
    sdkSecret: nextSdkSecret,
    updateSignSecret: nextUpdateSignSecret,
    sdkSecretPreview: maskSecret(updated.sdkSecret),
    updateSignSecretPreview: maskSecret(updated.updateSignSecret),
    previousSdkSecretPreview: updated.previousSdkSecret ? maskSecret(updated.previousSdkSecret) : null,
    previousSdkSecretExpiresAt: updated.previousSdkSecretExpiresAt
      ? updated.previousSdkSecretExpiresAt.toISOString()
      : null,
    previousUpdateSignSecretPreview: updated.previousUpdateSignSecret
      ? maskSecret(updated.previousUpdateSignSecret)
      : null,
    previousUpdateSignSecretExpiresAt: updated.previousUpdateSignSecretExpiresAt
      ? updated.previousUpdateSignSecretExpiresAt.toISOString()
      : null,
    rotatedAt: updated.updatedAt.toISOString(),
  };
}

export async function buildPhpSdkByAdmin(appId: string, actorId: string, baseUrl: string) {
  const app = await prisma.app.findFirst({
    where: { id: appId, isDeleted: false },
    select: {
      id: true,
      name: true,
      sdkKey: true,
      sdkSecret: true,
    },
  });
  if (!app) {
    throw new AppError("NOT_FOUND", "App not found", 404);
  }

  const escapedAppName = app.name.replace(/'/g, "\\'");
  const escapedBaseUrl = baseUrl.replace(/'/g, "\\'");
  const escapedAppId = app.id.replace(/'/g, "\\'");
  const escapedSdkKey = app.sdkKey.replace(/'/g, "\\'");
  const escapedSdkSecret = app.sdkSecret.replace(/'/g, "\\'");

  const content = `<?php
/**
 * ${escapedAppName} - Test SDK for license verification and remote update.
 * Keep this file private because it contains secrets.
 */
class ZmoauthSdkClient {
    private $baseUrl = '${escapedBaseUrl}';
    private $appId = '${escapedAppId}';
    private $sdkKey = '${escapedSdkKey}';
    private $sdkSecret = '${escapedSdkSecret}';

    public function __construct($baseUrl = null) {
        if ($baseUrl) {
            $this->baseUrl = rtrim($baseUrl, '/');
        }
    }

    public function verifyLicense($licenseKey, $bindTarget) {
        $timestamp = (int) floor(microtime(true) * 1000);
        $nonce = function_exists('random_bytes')
            ? bin2hex(random_bytes(8))
            : substr(md5(uniqid(mt_rand(), true)), 0, 16);
        $sign = hash_hmac('sha256', $licenseKey . $bindTarget . $timestamp . $nonce, $this->sdkSecret);

        return $this->request(
            'POST',
            '/api/v1/license/verify',
            array(
                'license_key' => $licenseKey,
                'bind_target' => $bindTarget,
                'timestamp' => $timestamp,
                'nonce' => $nonce,
                'sign' => $sign,
            )
        );
    }

    public function checkUpdate($currentVersion, $licenseKey) {
        return $this->request(
            'POST',
            '/api/v1/apps/' . rawurlencode($this->appId) . '/update/check',
            array(
                'currentVersion' => $currentVersion,
                'licenseKey' => $licenseKey,
            )
        );
    }

    public function getUpdatePackage($version, $licenseKey) {
        $path = '/api/v1/apps/' . rawurlencode($this->appId)
            . '/update/package/' . rawurlencode($version)
            . '?licenseKey=' . rawurlencode($licenseKey);

        return $this->request('GET', $path, null);
    }

    private function request($method, $path, $payload = null) {
        $url = $this->baseUrl . $path;
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Failed to init curl');
        }

        $headers = array('Content-Type: application/json');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        if ($payload !== null) {
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                curl_close($ch);
                throw new RuntimeException('Failed to encode JSON payload');
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        }

        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($errno !== 0) {
            throw new RuntimeException('HTTP request failed: ' . $error);
        }
        if (!is_string($raw)) {
            throw new RuntimeException('Unexpected empty response');
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new RuntimeException('Invalid JSON response: ' . $raw);
        }
        if ($status >= 400) {
            $msg = isset($data['message']) ? (string) $data['message'] : ('HTTP ' . $status);
            throw new RuntimeException($msg);
        }

        return $data;
    }
}
`;

  await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actorId),
      action: "APP_SDK_DOWNLOAD",
      resourceType: "app",
      resourceId: appId,
      details: {
        format: "php",
      },
    },
  });

  return {
    fileName: `${app.name.replace(/[^a-zA-Z0-9_-]+/g, "_") || "app"}_zmoauth_sdk.php`,
    content,
  };
}
