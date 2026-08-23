import { createHash, randomBytes, randomUUID } from "node:crypto";

export const SCHEMA_VERSION = "relay/v1";

const SECRET_RULES = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["generic bearer token", /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b/i],
];

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function cleanArtifacts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      label: cleanText(item?.label),
      uri: cleanText(item?.uri),
      digest: cleanText(item?.digest),
      status: ["verified", "unverified", "missing"].includes(item?.status)
        ? item.status
        : "unverified",
    }))
    .filter((item) => item.label || item.uri);
}

function cleanChecks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      command: cleanText(item?.command),
      result: cleanText(item?.result),
      status: ["passed", "failed", "blocked", "not_run"].includes(item?.status)
        ? item.status
        : "not_run",
    }))
    .filter((item) => item.command || item.result);
}

function cleanMemories(value) {
  if (!Array.isArray(value)) return [];
  const types = new Set(["finding", "evidence", "decision", "constraint", "rejected-approach", "test-result", "next-action"]);
  return value
    .map((item) => ({
      type: types.has(item?.type) ? item.type : "evidence",
      summary: cleanText(item?.summary),
      source: cleanText(item?.source, "human-agent-loop"),
      confidence: ["low", "medium", "high", "verified"].includes(item?.confidence)
        ? item.confidence
        : "medium",
      occurredAt: cleanText(item?.occurredAt),
      evidenceUri: cleanText(item?.evidenceUri),
    }))
    .filter((item) => item.summary);
}

export function normalizeCapsule(input, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Capsule must be a JSON object.");
  }

  const title = cleanText(input.title);
  const goal = cleanText(input.goal);
  const nextAction = cleanText(input.nextAction);
  if (!title) throw new TypeError("title is required.");
  if (!goal) throw new TypeError("goal is required.");
  if (!nextAction) throw new TypeError("nextAction is required.");

  return {
    schemaVersion: SCHEMA_VERSION,
    title,
    goal,
    acceptanceCriteria: cleanList(input.acceptanceCriteria),
    state: {
      completed: cleanList(input.state?.completed),
      partial: cleanList(input.state?.partial),
      blocked: cleanList(input.state?.blocked),
    },
    decisions: cleanList(input.decisions),
    constraints: cleanList(input.constraints),
    rejectedApproaches: cleanList(input.rejectedApproaches),
    openQuestions: cleanList(input.openQuestions),
    artifacts: cleanArtifacts(input.artifacts),
    validation: cleanChecks(input.validation),
    memories: cleanMemories(input.memories),
    sideEffects: cleanList(input.sideEffects),
    traceSummary: cleanText(input.traceSummary),
    nextAction,
    stopConditions: cleanList(input.stopConditions),
    source: {
      harness: cleanText(input.source?.harness, "generic"),
      model: cleanText(input.source?.model),
      actor: cleanText(input.source?.actor),
      taskId: cleanText(input.source?.taskId),
    },
    intendedRecipient: cleanText(input.intendedRecipient),
    createdAt: now.toISOString(),
  };
}

export function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestCapsule(capsule) {
  return `sha256:${createHash("sha256").update(canonicalStringify(capsule)).digest("hex")}`;
}

export function scanSecrets(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return SECRET_RULES.filter(([, pattern]) => pattern.test(serialized)).map(([name]) => name);
}

export function createToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRecord(input, options = {}) {
  const now = options.now ?? new Date();
  const capsule = normalizeCapsule(input, now);
  const secretMatches = scanSecrets(capsule);
  if (secretMatches.length) {
    const error = new Error(`Potential secret detected: ${secretMatches.join(", ")}`);
    error.code = "SECRET_DETECTED";
    error.matches = secretMatches;
    throw error;
  }

  const token = options.token ?? createToken();
  const ttlHours = Number.isFinite(options.ttlHours) ? options.ttlHours : 72;
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
  const id = options.id ?? randomUUID();

  return {
    token,
    record: {
      id,
      capsule,
      digest: digestCapsule(capsule),
      tokenHash: hashToken(token),
      status: "sealed",
      expiresAt,
      receipts: [],
    },
  };
}

export function publicRecord(record) {
  const { tokenHash: _tokenHash, ...safe } = record;
  return safe;
}

export function assertReadable(record, token, now = new Date()) {
  if (!record) {
    const error = new Error("Relay not found.");
    error.code = "NOT_FOUND";
    throw error;
  }
  if (!token || hashToken(token) !== record.tokenHash) {
    const error = new Error("Invalid capability token.");
    error.code = "FORBIDDEN";
    throw error;
  }
  if (new Date(record.expiresAt).getTime() <= now.getTime()) {
    const error = new Error("This relay has expired.");
    error.code = "EXPIRED";
    throw error;
  }
  if (digestCapsule(record.capsule) !== record.digest) {
    const error = new Error("Stored capsule failed its integrity check.");
    error.code = "INTEGRITY_FAILURE";
    throw error;
  }
  return record;
}
