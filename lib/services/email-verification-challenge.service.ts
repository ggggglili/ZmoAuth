import { randomInt, randomUUID } from "node:crypto";
import { AppError } from "@/lib/errors";

const CHALLENGE_PREFIX = "email-verification:challenge";
const CHALLENGE_TTL_SECONDS = 10 * 60;
const CHALLENGE_MIN_SOLVE_MS = 1200;

type ChallengeOperator = "+" | "-";

interface ChallengeRecord {
  issuedAtMs: number;
  answer: string;
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
    if (value.expiresAtMs <= now) FALLBACK_KV.delete(key);
  }
}

function setFallbackKv(key: string, value: string, ttlSeconds: number) {
  FALLBACK_KV.set(key, {
    value,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });
}

function getFallbackKv(key: string) {
  cleanupFallbackKv();
  const item = FALLBACK_KV.get(key);
  if (!item) return null;
  if (item.expiresAtMs <= Date.now()) {
    FALLBACK_KV.delete(key);
    return null;
  }
  return item.value;
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
  if (!response.ok) throw new Error(`Upstash set failed: HTTP ${response.status}`);
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
  if (!response.ok) throw new Error(`Upstash get failed: HTTP ${response.status}`);
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
  if (!response.ok) throw new Error(`Upstash del failed: HTTP ${response.status}`);
  return true;
}

async function setKv(key: string, value: string, ttlSeconds: number) {
  const upstashResult = await upstashSet(key, value, ttlSeconds);
  if (upstashResult) return;
  setFallbackKv(key, value, ttlSeconds);
}

async function getKv(key: string) {
  const upstashResult = await upstashGet(key);
  if (typeof upstashResult === "string") return upstashResult;
  return getFallbackKv(key);
}

async function deleteKv(key: string) {
  const upstashResult = await upstashDelete(key);
  if (upstashResult) return;
  deleteFallbackKv(key);
}

function getChallengeKey(challengeId: string) {
  return `${CHALLENGE_PREFIX}:${challengeId}`;
}

function createMathQuestion() {
  const operator: ChallengeOperator = randomInt(0, 2) === 0 ? "+" : "-";
  const left = randomInt(12, 99);
  const right = randomInt(1, 10);

  if (operator === "+") {
    return {
      prompt: `${left} + ${right} = ?`,
      answer: String(left + right),
    };
  }

  return {
    prompt: `${left} - ${right} = ?`,
    answer: String(left - right),
  };
}

export async function createEmailVerificationChallenge() {
  const challengeId = randomUUID();
  const { prompt, answer } = createMathQuestion();

  const record: ChallengeRecord = {
    issuedAtMs: Date.now(),
    answer,
  };

  await setKv(getChallengeKey(challengeId), JSON.stringify(record), CHALLENGE_TTL_SECONDS);

  return {
    challengeId,
    prompt,
    expiresInSeconds: CHALLENGE_TTL_SECONDS,
  };
}

export async function verifyEmailVerificationChallenge(input: {
  challengeId: string;
  answer: string;
  solvedAt: number;
}) {
  const challengeKey = getChallengeKey(input.challengeId);
  const rawRecord = await getKv(challengeKey);
  if (!rawRecord) {
    throw new AppError("VALIDATION_ERROR", "验证已失效，请重新获取。", 400);
  }

  // Consume challenge once read: one challenge can only verify one request.
  await deleteKv(challengeKey);

  let record: ChallengeRecord | null = null;
  try {
    const parsed = JSON.parse(rawRecord) as ChallengeRecord;
    if (typeof parsed?.issuedAtMs === "number" && typeof parsed?.answer === "string") {
      record = parsed;
    }
  } catch {
    record = null;
  }

  if (!record) {
    throw new AppError("VALIDATION_ERROR", "验证已失效，请重新获取。", 400);
  }

  const now = Date.now();
  if (record.issuedAtMs + CHALLENGE_TTL_SECONDS * 1000 < now) {
    throw new AppError("VALIDATION_ERROR", "验证已过期，请重新获取。", 400);
  }

  if (input.solvedAt - record.issuedAtMs < CHALLENGE_MIN_SOLVE_MS) {
    throw new AppError("VALIDATION_ERROR", "验证过快，请重试。", 400);
  }

  const answer = input.answer.trim();
  if (!/^\d+$/.test(answer) || answer !== record.answer) {
    throw new AppError("VALIDATION_ERROR", "验证答案错误，请重试。", 400);
  }
}
