import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

const SYSTEM_SETTINGS_ACTION = "SYSTEM_SETTINGS_SET";
const DEFAULT_SYSTEM_NAME = "ZmoAuth";
const DEFAULT_LICENSE_REBIND_COST_POINTS = 0;
const MAX_LICENSE_REBIND_COST_POINTS = 1_000_000;
const DEFAULT_SMTP_PORT = 465;

const SMTP_KEY_DERIVATION_SCOPE = "system-settings-smtp";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SystemSmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
}

export interface SystemSettings {
  systemName: string;
  licenseRebindCostPoints: number;
  smtp: SystemSmtpSettings;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SmtpDeliverySettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

interface NormalizedSettingsInternal {
  systemName: string;
  licenseRebindCostPoints: number;
  smtp: SystemSmtpSettings;
  smtpPasswordEncrypted: string | null;
}

function normalizeAuditActorId(actorId?: string | null) {
  if (!actorId) return null;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actorId
    );
  return isUuid ? actorId : null;
}

function getSecretKey() {
  const baseSecret = process.env.NEXTAUTH_SECRET?.trim();
  if (!baseSecret) return null;
  return createHash("sha256").update(`${SMTP_KEY_DERIVATION_SCOPE}:${baseSecret}`).digest();
}

function encryptSecret(plaintext: string) {
  const key = getSecretKey();
  if (!key) {
    throw new AppError(
      "VALIDATION_ERROR",
      "NEXTAUTH_SECRET is required before saving SMTP password.",
      500
    );
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

function decryptSecret(payload: string) {
  const key = getSecretKey();
  if (!key) return null;

  try {
    const raw = Buffer.from(payload, "base64url");
    if (raw.length <= 12 + 16) return null;
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonNegativeInt(raw: unknown, fallback: number) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return Number(raw);
  }
  return fallback;
}

function normalizeSmtp(raw: unknown) {
  const source = asRecord(raw);
  const host = typeof source?.host === "string" ? source.host.trim() : "";
  const username = typeof source?.username === "string" ? source.username.trim() : "";
  const fromEmail = typeof source?.fromEmail === "string" ? source.fromEmail.trim() : "";
  const fromName = typeof source?.fromName === "string" ? source.fromName.trim() : "";

  let port = DEFAULT_SMTP_PORT;
  if (typeof source?.port === "number" && Number.isInteger(source.port)) {
    port = source.port;
  } else if (typeof source?.port === "string" && /^\d+$/.test(source.port)) {
    port = Number(source.port);
  }
  port = Math.min(65535, Math.max(1, port));

  const secure = typeof source?.secure === "boolean" ? source.secure : port === 465;
  const enabled = Boolean(source?.enabled);
  const passwordEncrypted =
    typeof source?.passwordEncrypted === "string" && source.passwordEncrypted.trim()
      ? source.passwordEncrypted.trim()
      : null;

  const smtp: SystemSmtpSettings = {
    enabled,
    host,
    port,
    secure,
    username,
    fromEmail,
    fromName,
    hasPassword: Boolean(passwordEncrypted),
  };

  return { smtp, passwordEncrypted };
}

function normalizeSettingsDetails(details: unknown): NormalizedSettingsInternal {
  const raw = asRecord(details);
  const systemNameRaw = typeof raw?.systemName === "string" ? raw.systemName.trim() : "";
  const licenseRebindCostPoints = normalizeNonNegativeInt(
    raw?.licenseRebindCostPoints,
    DEFAULT_LICENSE_REBIND_COST_POINTS
  );
  const normalizedSmtp = normalizeSmtp(raw?.smtp);

  return {
    systemName: systemNameRaw || DEFAULT_SYSTEM_NAME,
    licenseRebindCostPoints: Math.min(licenseRebindCostPoints, MAX_LICENSE_REBIND_COST_POINTS),
    smtp: normalizedSmtp.smtp,
    smtpPasswordEncrypted: normalizedSmtp.passwordEncrypted,
  };
}

async function getLatestSystemSettingsRecord() {
  return prisma.auditLog.findFirst({
    where: {
      action: SYSTEM_SETTINGS_ACTION,
      resourceType: "system_settings",
    },
    orderBy: { createdAt: "desc" },
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
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const latest = await getLatestSystemSettingsRecord();

  if (!latest) {
    return {
      systemName: DEFAULT_SYSTEM_NAME,
      licenseRebindCostPoints: DEFAULT_LICENSE_REBIND_COST_POINTS,
      smtp: {
        enabled: false,
        host: "",
        port: DEFAULT_SMTP_PORT,
        secure: true,
        username: "",
        fromEmail: "",
        fromName: "",
        hasPassword: false,
      },
      updatedAt: null,
      updatedBy: null,
    };
  }

  const normalized = normalizeSettingsDetails(latest.details);
  return {
    systemName: normalized.systemName,
    licenseRebindCostPoints: normalized.licenseRebindCostPoints,
    smtp: normalized.smtp,
    updatedAt: latest.createdAt.toISOString(),
    updatedBy: latest.actor?.email ?? null,
  };
}

export async function setSystemSettings(
  actor: SessionUser,
  input: {
    systemName: string;
    licenseRebindCostPoints: number;
    smtp: {
      enabled: boolean;
      host: string;
      port: number;
      secure: boolean;
      username: string;
      fromEmail: string;
      fromName: string;
      password?: string;
    };
  }
): Promise<SystemSettings> {
  if (actor.role !== "SUPER_ADMIN") {
    throw new AppError("FORBIDDEN", "Forbidden", 403);
  }

  const systemName = input.systemName.trim();
  if (!systemName) {
    throw new AppError("VALIDATION_ERROR", "System name is required.", 400);
  }
  if (systemName.length > 100) {
    throw new AppError("VALIDATION_ERROR", "System name must be at most 100 characters.", 400);
  }

  if (
    !Number.isInteger(input.licenseRebindCostPoints) ||
    input.licenseRebindCostPoints < 0 ||
    input.licenseRebindCostPoints > MAX_LICENSE_REBIND_COST_POINTS
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `License rebind cost must be an integer between 0 and ${MAX_LICENSE_REBIND_COST_POINTS}.`,
      400
    );
  }

  if (!Number.isInteger(input.smtp.port) || input.smtp.port < 1 || input.smtp.port > 65535) {
    throw new AppError("VALIDATION_ERROR", "SMTP port must be an integer between 1 and 65535.", 400);
  }

  const smtpHost = input.smtp.host.trim();
  const smtpUsername = input.smtp.username.trim();
  const smtpFromEmail = input.smtp.fromEmail.trim().toLowerCase();
  const smtpFromName = input.smtp.fromName.trim();

  const latest = await getLatestSystemSettingsRecord();
  const latestNormalized = latest ? normalizeSettingsDetails(latest.details) : null;

  let smtpPasswordEncrypted = latestNormalized?.smtpPasswordEncrypted ?? null;
  const smtpPasswordRaw = input.smtp.password?.trim();
  if (typeof smtpPasswordRaw === "string" && smtpPasswordRaw.length > 0) {
    smtpPasswordEncrypted = encryptSecret(smtpPasswordRaw);
  }

  if (input.smtp.enabled) {
    if (!smtpHost) {
      throw new AppError("VALIDATION_ERROR", "SMTP host is required when SMTP is enabled.", 400);
    }
    if (!smtpUsername) {
      throw new AppError("VALIDATION_ERROR", "SMTP username is required when SMTP is enabled.", 400);
    }
    if (!smtpFromName) {
      throw new AppError("VALIDATION_ERROR", "SMTP sender name is required when SMTP is enabled.", 400);
    }
    if (!smtpFromEmail || !emailPattern.test(smtpFromEmail)) {
      throw new AppError("VALIDATION_ERROR", "SMTP sender email is invalid.", 400);
    }
    if (!smtpPasswordEncrypted) {
      throw new AppError("VALIDATION_ERROR", "SMTP password is required when SMTP is enabled.", 400);
    }
  }

  const record = await prisma.auditLog.create({
    data: {
      actorId: normalizeAuditActorId(actor.id),
      action: SYSTEM_SETTINGS_ACTION,
      resourceType: "system_settings",
      resourceId: null,
      details: {
        systemName,
        licenseRebindCostPoints: input.licenseRebindCostPoints,
        smtp: {
          enabled: input.smtp.enabled,
          host: smtpHost,
          port: input.smtp.port,
          secure: input.smtp.secure,
          username: smtpUsername,
          fromEmail: smtpFromEmail,
          fromName: smtpFromName,
          passwordEncrypted: smtpPasswordEncrypted,
        },
      },
    },
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

  const normalized = normalizeSettingsDetails(record.details);
  return {
    systemName: normalized.systemName,
    licenseRebindCostPoints: normalized.licenseRebindCostPoints,
    smtp: normalized.smtp,
    updatedAt: record.createdAt.toISOString(),
    updatedBy: record.actor?.email ?? null,
  };
}

export async function getSmtpDeliverySettings(): Promise<SmtpDeliverySettings | null> {
  const latest = await getLatestSystemSettingsRecord();
  const normalized = normalizeSettingsDetails(latest?.details);

  if (!normalized.smtp.enabled) return null;
  if (!normalized.smtpPasswordEncrypted) return null;

  const password = decryptSecret(normalized.smtpPasswordEncrypted);
  if (!password) return null;

  const { host, port, secure, username, fromEmail, fromName } = normalized.smtp;
  if (!host || !username || !fromEmail || !fromName) return null;

  return {
    host,
    port,
    secure,
    username,
    password,
    fromEmail,
    fromName,
  };
}
