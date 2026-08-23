function normalizeOrigin(value) {
  if (!value) return "";
  try { return new URL(value).origin; } catch { throw new TypeError(`Invalid origin: ${value}`); }
}

export function publicOrigin(value) {
  return normalizeOrigin(value).replace(/\/$/, "");
}

export function sessionLinks({ id, token, hostOrigin, inviteOrigin, creatorRole = "swe" }) {
  const fragment = `session=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
  return {
    hostWorkspaceUrl: `${publicOrigin(hostOrigin)}/demo/greptile#${fragment}&role=${creatorRole === "pm" ? "pm" : "swe"}`,
    pmInviteUrl: `${publicOrigin(inviteOrigin || hostOrigin)}/demo/greptile#${fragment}&role=pm`,
    collaboratorInviteUrl: `${publicOrigin(inviteOrigin || hostOrigin)}/demo/greptile#${fragment}&role=collaborator`,
  };
}

export function allowedRequestOrigin(request, url, configured = "", advertised = "") {
  const origin = request.headers.origin;
  if (!origin) return { allowed: true, responseOrigin: "" };
  const requestOrigin = `${request.headers["x-forwarded-proto"] ?? url.protocol.replace(":", "")}://${request.headers["x-forwarded-host"] ?? request.headers.host}`;
  const allowed = new Set([
    normalizeOrigin(requestOrigin),
    ...String(configured).split(",").map((item) => item.trim()).filter(Boolean).map(normalizeOrigin),
    ...(advertised ? [normalizeOrigin(advertised)] : []),
  ]);
  return { allowed: allowed.has(normalizeOrigin(origin)), responseOrigin: allowed.has(normalizeOrigin(origin)) ? normalizeOrigin(origin) : "" };
}

export class SessionRateLimiter {
  constructor({ limit = 120, windowMs = 60_000, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map();
  }

  check(sessionId, weight = 1) {
    const now = this.now();
    const current = this.buckets.get(sessionId);
    const bucket = !current || now - current.startedAt >= this.windowMs
      ? { startedAt: now, used: 0 }
      : current;
    bucket.used += weight;
    this.buckets.set(sessionId, bucket);
    if (bucket.used > this.limit) {
      const error = new Error("This session is sending requests too quickly. Retry shortly.");
      error.code = "RATE_LIMITED";
      error.retryAfter = Math.max(1, Math.ceil((this.windowMs - (now - bucket.startedAt)) / 1_000));
      throw error;
    }
    return { remaining: Math.max(0, this.limit - bucket.used), resetAt: bucket.startedAt + this.windowMs };
  }
}
