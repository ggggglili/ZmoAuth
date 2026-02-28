import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { reserveVerifyNonce } from "@/lib/security/nonce-replay";
import { sendSmtpMail } from "@/lib/services/smtp-mail.service";
import { getSystemSettings } from "@/lib/services/system-settings.service";

const EMAIL_VERIFICATION_CODE_PREFIX = "email-verification:code";
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

export const EMAIL_VERIFICATION_CODE_TTL_SECONDS = 5 * 60;
export const EMAIL_VERIFICATION_SEND_COOLDOWN_SECONDS = 60;

interface VerificationCodeRecord {
  codeHash: string;
  attempts: number;
  expiresAtMs: number;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildRegistrationVerificationEmailHtml(input: {
  systemName: string;
  code: string;
  expireMinutes: number;
}) {
  const systemName = escapeHtml(input.systemName);
  const code = escapeHtml(input.code);
  const expireMinutes = input.expireMinutes;

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    `<title>${systemName} 注册验证码</title>`,
    "</head>",
    '<body style="margin:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">',
    "<tr>",
    '<td align="center" style="padding:40px 20px 28px;font-size:16px;color:#444;">',
    `你正在使用 ${systemName} 进行邮箱验证`,
    "</td>",
    "</tr>",
    "<tr>",
    `<td align="center" style="padding:0 12px;font-size:clamp(40px,9vw,72px);line-height:1;font-weight:800;letter-spacing:12px;color:#111;">${code}</td>`,
    "</tr>",
    "<tr>",
    '<td align="center" style="padding:28px 20px 0;font-size:15px;color:#444;">',
    `验证码 ${expireMinutes} 分钟内有效`,
    "</td>",
    "</tr>",
    "<tr>",
    '<td align="center" style="padding:10px 20px 44px;font-size:13px;color:#777;">如非本人操作，请忽略本邮件</td>',
    "</tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");
}

const FALLBACK_KV = new Map<string, { value: string; expiresAtMs: number }>();

function getUpstashConfig() {
  return {
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

function cleanupFallbackKv() {
  const now = Date.now();
  for (const [key, value] of FALLBACK_KV.entries()) {
    if (value.expiresAtMs <= now) {
      FALLBACK_KV.delete(key);
    }
  }
}

function getFallbackKv(key: string) {
  cleanupFallbackKv();
  const hit = FALLBACK_KV.get(key);
  if (!hit) return null;
  if (hit.expiresAtMs <= Date.now()) {
    FALLBACK_KV.delete(key);
    return null;
  }
  return hit.value;
}

function setFallbackKv(key: string, value: string, ttlSeconds: number) {
  FALLBACK_KV.set(key, {
    value,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });
}

function deleteFallbackKv(key: string) {
  FALLBACK_KV.delete(key);
}

async function upstashSet(key: string, value: string, ttlSeconds: number) {
  const { restUrl, restToken } = getUpstashConfig();
  if (!restUrl || !restToken) return null;

  const normalizedUrl = restUrl.endsWith("/") ? restUrl.slice(0, -1) : restUrl;
  const endpoint = `${normalizedUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${ttlSeconds}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Upstash set failed: HTTP ${response.status}`);
  }
  return true;
}

async function upstashGet(key: string) {
  const { restUrl, restToken } = getUpstashConfig();
  if (!restUrl || !restToken) return null;

  const normalizedUrl = restUrl.endsWith("/") ? restUrl.slice(0, -1) : restUrl;
  const endpoint = `${normalizedUrl}/get/${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Upstash get failed: HTTP ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as { result?: string | null } | null;
  return payload?.result ?? null;
}

async function upstashDelete(key: string) {
  const { restUrl, restToken } = getUpstashConfig();
  if (!restUrl || !restToken) return null;

  const normalizedUrl = restUrl.endsWith("/") ? restUrl.slice(0, -1) : restUrl;
  const endpoint = `${normalizedUrl}/del/${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Upstash del failed: HTTP ${response.status}`);
  }
  return true;
}

async function setKv(key: string, value: string, ttlSeconds: number) {
  const upstashSetResult = await upstashSet(key, value, ttlSeconds);
  if (upstashSetResult) return;
  setFallbackKv(key, value, ttlSeconds);
}

async function getKv(key: string) {
  const upstashGetResult = await upstashGet(key);
  if (typeof upstashGetResult === "string") return upstashGetResult;
  return getFallbackKv(key);
}

async function delKv(key: string) {
  const upstashDelResult = await upstashDelete(key);
  if (upstashDelResult) return;
  deleteFallbackKv(key);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getCodeStoreKey(email: string) {
  return `${EMAIL_VERIFICATION_CODE_PREFIX}:${email}`;
}

function hashCode(email: string, code: string) {
  const secret = process.env.NEXTAUTH_SECRET || "email-verification-dev-secret";
  return createHash("sha256").update(`${email}:${code}:${secret}`).digest("hex");
}

function isHashEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function createCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function putCodeRecord(email: string, record: VerificationCodeRecord) {
  const key = getCodeStoreKey(email);
  const ttlSeconds = Math.max(1, Math.ceil((record.expiresAtMs - Date.now()) / 1000));
  await setKv(key, JSON.stringify(record), ttlSeconds);
}

async function getCodeRecord(email: string): Promise<VerificationCodeRecord | null> {
  const key = getCodeStoreKey(email);
  const raw = await getKv(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VerificationCodeRecord;
    if (
      !parsed ||
      typeof parsed.codeHash !== "string" ||
      typeof parsed.attempts !== "number" ||
      typeof parsed.expiresAtMs !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function clearCodeRecord(email: string) {
  await delKv(getCodeStoreKey(email));
}

export async function sendRegistrationEmailVerificationCode(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new AppError("VALIDATION_ERROR", "Invalid email format.", 400);
  }

  const allowed = await reserveVerifyNonce(
    `email-verification:send:${email}`,
    EMAIL_VERIFICATION_SEND_COOLDOWN_SECONDS
  );
  if (!allowed) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Please wait ${EMAIL_VERIFICATION_SEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
      429
    );
  }

  const code = createCode();
  const expiresAtMs = Date.now() + EMAIL_VERIFICATION_CODE_TTL_SECONDS * 1000;
  await putCodeRecord(email, {
    codeHash: hashCode(email, code),
    attempts: 0,
    expiresAtMs,
  });

  const { systemName } = await getSystemSettings();
  const expireMinutes = Math.floor(EMAIL_VERIFICATION_CODE_TTL_SECONDS / 60);
  const subject = `【${systemName}】注册验证码`;
  const text = [
    `${systemName} 注册验证码：${code}`,
    `验证码 ${expireMinutes} 分钟内有效，请勿泄露给任何人。`,
    "如非本人操作，请忽略本邮件。",
  ].join("\n");
  const html = buildRegistrationVerificationEmailHtml({ systemName, code, expireMinutes });

  try {
    await sendSmtpMail({
      to: email,
      subject,
      text,
      html,
    });
  } catch (error) {
    await clearCodeRecord(email);
    throw error;
  }
}

export async function verifyRegistrationEmailVerificationCode(rawEmail: string, code: string) {
  const email = normalizeEmail(rawEmail);
  const normalizedCode = code.trim();

  if (!isValidEmail(email)) {
    throw new AppError("VALIDATION_ERROR", "Invalid email format.", 400);
  }
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new AppError("VALIDATION_ERROR", "Verification code must be 6 digits.", 400);
  }

  const record = await getCodeRecord(email);
  if (!record) {
    throw new AppError("VALIDATION_ERROR", "Verification code not found or expired.", 400);
  }

  if (record.expiresAtMs <= Date.now()) {
    await clearCodeRecord(email);
    throw new AppError("VALIDATION_ERROR", "Verification code not found or expired.", 400);
  }

  const expectedHash = hashCode(email, normalizedCode);
  if (!isHashEqual(expectedHash, record.codeHash)) {
    const nextAttempts = record.attempts + 1;
    if (nextAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      await clearCodeRecord(email);
      throw new AppError(
        "VALIDATION_ERROR",
        "Too many incorrect attempts. Please request a new code.",
        400
      );
    }

    await putCodeRecord(email, {
      ...record,
      attempts: nextAttempts,
    });

    throw new AppError("VALIDATION_ERROR", "Verification code is incorrect.", 400);
  }

  await clearCodeRecord(email);
}
