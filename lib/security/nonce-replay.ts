const NONCE_FALLBACK_MAP = new Map<string, number>();

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

function getUpstashConfig() {
  return {
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

function cleanupExpiredFallbackNonces() {
  const now = Date.now();
  for (const [key, expiresAt] of NONCE_FALLBACK_MAP.entries()) {
    if (expiresAt <= now) {
      NONCE_FALLBACK_MAP.delete(key);
    }
  }
}

async function reserveNonceWithUpstash(key: string, ttlSeconds: number) {
  const { restUrl, restToken } = getUpstashConfig();

  if (!restUrl || !restToken) {
    return null;
  }

  const normalizedUrl = restUrl.endsWith("/") ? restUrl.slice(0, -1) : restUrl;
  // Upstash REST command format for SET with options is path-based:
  // /set/<key>/<value>/EX/<ttl>/NX
  // Query params like ?NX=true&EX=60 can return HTTP 400 on some Upstash deployments.
  const endpoint = `${normalizedUrl}/set/${encodeURIComponent(key)}/1/EX/${ttlSeconds}/NX`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Upstash nonce reserve failed: HTTP ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | { result?: string | null }
    | null;

  return payload?.result === "OK";
}

function reserveNonceWithFallbackMemory(key: string, ttlSeconds: number) {
  cleanupExpiredFallbackNonces();

  const now = Date.now();
  const exists = NONCE_FALLBACK_MAP.get(key);
  if (typeof exists === "number" && exists > now) {
    return false;
  }

  NONCE_FALLBACK_MAP.set(key, now + ttlSeconds * 1000);
  return true;
}

export async function reserveVerifyNonce(key: string, ttlSeconds: number) {
  const upstashResult = await reserveNonceWithUpstash(key, ttlSeconds);
  if (typeof upstashResult === "boolean") {
    return upstashResult;
  }

  if (isProductionEnv()) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production."
    );
  }

  // Development fallback when Redis is not configured.
  return reserveNonceWithFallbackMemory(key, ttlSeconds);
}
