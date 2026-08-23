import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { greptileComments } from "./improvement-loop.mjs";

const FIELDS = new Set(["problem", "constraint", "acceptance", "implementation"]);

function text(value, limit = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function capability() {
  return randomBytes(32).toString("base64url");
}

function tokenHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeTokenMatch(value, expected) {
  if (!value || !expected) return false;
  const actual = Buffer.from(tokenHash(value), "hex");
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function sessionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeRepository(input = {}) {
  const name = text(input.name, 240);
  const prNumber = input.prNumber == null ? null : Number(input.prNumber);
  if (prNumber !== null && (!Number.isInteger(prNumber) || prNumber <= 0)) {
    throw new TypeError("When supplied, the PR number must be positive.");
  }
  if (!name) return {
    name: "Local workspace",
    remote: "local",
    defaultBranch: "",
    branch: "",
    prNumber: null,
  };
  return {
    name,
    remote: text(input.remote, 40) || "github",
    defaultBranch: text(input.defaultBranch, 120) || "main",
    branch: text(input.branch, 240),
    prNumber,
  };
}

function commentId(comment) {
  return text(comment?.id ?? comment?.commentId ?? comment?.nodeId, 240);
}

function normalizeComment(comment, state, now) {
  return {
    id: commentId(comment),
    state,
    summary: text(comment?.body ?? comment?.content ?? comment?.message ?? comment?.summary, 8_000),
    path: text(comment?.path ?? comment?.filePath ?? comment?.location?.path, 1_000),
    url: text(comment?.url ?? comment?.htmlUrl, 2_000),
    firstSeenAt: now,
    lastSeenAt: now,
    closedAt: state === "closed" ? now : null,
  };
}

export class SessionFileStore {
  constructor(root) {
    this.root = root;
    this.queues = new Map();
  }

  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  fileFor(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new TypeError("Invalid session id.");
    return path.join(this.root, `${id}.json`);
  }

  async create(record) {
    const target = this.fileFor(record.id);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    return record;
  }

  async get(id) {
    try {
      return JSON.parse(await readFile(this.fileFor(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async update(id, mutate) {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const record = await this.get(id);
      if (!record) return null;
      const updated = await mutate(structuredClone(record));
      const target = this.fileFor(id);
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, target);
      return updated;
    });
    this.queues.set(id, operation.catch(() => {}));
    return operation;
  }
}

export class SessionService {
  constructor({ store, now = () => new Date(), greptileClient } = {}) {
    this.store = store;
    this.now = now;
    this.greptileClient = greptileClient;
    this.participants = new Map();
    this.clients = new Map();
  }

  async create(input = {}) {
    const title = text(input.title, 200);
    if (!title) throw new TypeError("Session title or goal is required.");
    const token = capability();
    const now = this.now();
    const ttlHours = Number(input.ttlHours ?? 72);
    if (!(ttlHours > 0 && ttlHours <= 168)) throw new TypeError("ttlHours must be between 0 and 168.");
    const record = {
      id: randomUUID(),
      title,
      tokenHash: tokenHash(token),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
      repository: normalizeRepository(input.repository),
      version: 0,
      brief: {
        problem: title,
        constraint: "Preserve verified context and keep agent execution serialized.",
        acceptance: "Both SWEs see the same state, evidence, and next action.",
        implementation: "Review the shared brief, then queue the next safe action.",
      },
      activity: [],
      claudeMem: { observationIds: [], lastRecallAt: null },
      checkpoints: [],
      agentRuns: [],
      greptile: { iteration: 0, initialized: false, findings: {}, samples: [], lastSyncAt: null },
    };
    await this.store.create(record);
    return { token, record: this.snapshot(record) };
  }

  assertReadable(record, token) {
    if (!record) throw sessionError("NOT_FOUND", "Session not found.");
    if (!safeTokenMatch(token, record.tokenHash)) throw sessionError("FORBIDDEN", "Invalid session capability.");
    if (new Date(record.expiresAt).getTime() <= this.now().getTime()) {
      throw sessionError("EXPIRED", "This session capability has expired.");
    }
    return record;
  }

  snapshot(record) {
    const { tokenHash: _tokenHash, ...safe } = record;
    const cutoff = this.now().getTime() - 30_000;
    const participants = [...(this.participants.get(record.id)?.values() ?? [])]
      .filter((person) => new Date(person.lastSeenAt).getTime() >= cutoff);
    return { ...safe, participants, activity: safe.activity.slice(-50) };
  }

  async get(id, token) {
    return this.snapshot(this.assertReadable(await this.store.get(id), token));
  }

  async join(id, token, input = {}) {
    const record = this.assertReadable(await this.store.get(id), token);
    const people = this.participants.get(id) ?? new Map();
    const participantId = text(input.id, 100) || randomUUID();
    const existing = people.get(participantId);
    people.set(participantId, {
      id: participantId,
      name: text(input.name, 80) || existing?.name || "Collaborator",
      role: text(input.role, 80) || existing?.role || "Contributor",
      color: text(input.color, 20) || existing?.color || "#ff5a1f",
      activeField: text(input.activeField, 40) || existing?.activeField || "",
      lastSeenAt: this.now().toISOString(),
    });
    this.participants.set(id, people);
    const snapshot = this.snapshot(record);
    this.broadcast(id, "presence", snapshot);
    return snapshot;
  }

  async updateBrief(id, token, input = {}) {
    const existing = this.assertReadable(await this.store.get(id), token);
    const field = text(input.field, 40);
    if (!FIELDS.has(field)) throw new TypeError(`Unknown shared field: ${field}`);
    const actor = text(input.actor, 80) || "Collaborator";
    const actorId = text(input.actorId, 100);
    if (actorId) await this.join(id, token, { id: actorId, name: actor, role: input.role, activeField: field, color: input.color });
    const updated = await this.store.update(existing.id, (record) => {
      this.assertReadable(record, token);
      record.brief[field] = text(input.value);
      record.version += 1;
      record.updatedAt = this.now().toISOString();
      const event = { id: randomUUID(), type: "edit", actor, detail: `updated ${field}`, value: record.brief[field], at: record.updatedAt, version: record.version };
      const previous = record.activity.at(-1);
      if (previous?.type === "edit" && previous.actor === actor && previous.detail === event.detail) record.activity[record.activity.length - 1] = event;
      else record.activity.push(event);
      return record;
    });
    const snapshot = this.snapshot(updated);
    this.broadcast(id, "workspace", snapshot);
    return snapshot;
  }

  async addActivity(id, token, input = {}) {
    this.assertReadable(await this.store.get(id), token);
    let event;
    const updated = await this.store.update(id, (record) => {
      event = {
        id: randomUUID(), type: text(input.type, 40) || "agent",
        actor: text(input.actor, 80) || "Relay agent",
        detail: text(input.detail, 500) || "activity recorded",
        value: text(input.value, 4_000),
        at: this.now().toISOString(), version: record.version,
      };
      record.activity.push(event);
      record.updatedAt = event.at;
      return record;
    });
    this.broadcast(id, "activity", this.snapshot(updated));
    return event;
  }

  async remember(id, token, observationIds = []) {
    this.assertReadable(await this.store.get(id), token);
    const ids = [...new Set(observationIds.map((value) => text(String(value), 240)).filter(Boolean))];
    const updated = await this.store.update(id, (record) => {
      record.claudeMem.observationIds = [...new Set([...record.claudeMem.observationIds, ...ids])];
      record.claudeMem.lastRecallAt = this.now().toISOString();
      record.updatedAt = record.claudeMem.lastRecallAt;
      return record;
    });
    const snapshot = this.snapshot(updated);
    this.broadcast(id, "memory", snapshot);
    return snapshot;
  }

  async syncGreptile(id, token) {
    const record = this.assertReadable(await this.store.get(id), token);
    if (!record.repository.prNumber) throw sessionError("NO_PULL_REQUEST", "Greptile starts after this repository has a pull request.");
    const [openResult, addressedResult] = await Promise.all([
      this.greptileClient.listGreptileComments(record.repository, false),
      this.greptileClient.listGreptileComments(record.repository, true),
    ]);
    const open = greptileComments(openResult).filter(commentId);
    const addressed = greptileComments(addressedResult).filter(commentId);
    const now = this.now().toISOString();
    const updated = await this.store.update(id, (current) => {
      this.assertReadable(current, token);
      const state = current.greptile;
      const openById = new Map(open.map((item) => [commentId(item), item]));
      const addressedById = new Map(addressed.map((item) => [commentId(item), item]));
      if (!state.initialized) {
        for (const [findingId, comment] of openById) state.findings[findingId] = normalizeComment(comment, "open", now);
        state.initialized = true;
      } else {
        for (const [findingId, comment] of openById) {
          const known = state.findings[findingId];
          state.findings[findingId] = known
            ? { ...known, state: "open", lastSeenAt: now, closedAt: null }
            : normalizeComment(comment, "open", now);
        }
        for (const [findingId, known] of Object.entries(state.findings)) {
          if (addressedById.has(findingId)) {
            state.findings[findingId] = { ...known, state: "closed", lastSeenAt: now, closedAt: known.closedAt ?? now };
          } else if (!openById.has(findingId)) {
            state.findings[findingId] = { ...known, state: "unknown", lastSeenAt: now };
          }
        }
      }
      state.iteration += 1;
      state.lastSyncAt = now;
      const values = Object.values(state.findings);
      state.samples.push({
        timestamp: now,
        iteration: state.iteration,
        opened: values.length,
        closed: values.filter((item) => item.state === "closed").length,
        remaining: values.filter((item) => item.state === "open").length,
        unknown: values.filter((item) => item.state === "unknown").length,
      });
      current.updatedAt = now;
      current.activity.push({ id: randomUUID(), type: "greptile", actor: "Greptile", detail: `synced review iteration ${state.iteration}`, at: now, version: current.version });
      return current;
    });
    const snapshot = this.snapshot(updated);
    this.broadcast(id, "greptile", snapshot);
    return this.metrics(updated);
  }

  metrics(record) {
    const findings = Object.values(record.greptile.findings);
    return {
      sessionId: record.id,
      repository: record.repository,
      iteration: record.greptile.iteration,
      lastSyncAt: record.greptile.lastSyncAt,
      totals: {
        opened: findings.length,
        closed: findings.filter((item) => item.state === "closed").length,
        remaining: findings.filter((item) => item.state === "open").length,
        unknown: findings.filter((item) => item.state === "unknown").length,
      },
      samples: record.greptile.samples,
      findings,
    };
  }

  async getMetrics(id, token) {
    return this.metrics(this.assertReadable(await this.store.get(id), token));
  }

  async addCheckpoint(id, token, checkpoint) {
    this.assertReadable(await this.store.get(id), token);
    const updated = await this.store.update(id, (record) => {
      record.checkpoints.push(checkpoint);
      record.updatedAt = checkpoint.createdAt;
      record.activity.push({ id: randomUUID(), type: "checkpoint", actor: checkpoint.actor ?? "Relay", detail: `sealed shared brief v${record.version}`, at: checkpoint.createdAt, version: record.version });
      return record;
    });
    const snapshot = this.snapshot(updated);
    this.broadcast(id, "checkpoint", snapshot);
    return snapshot;
  }

  async addAgentRun(id, token, run) {
    this.assertReadable(await this.store.get(id), token);
    const updated = await this.store.update(id, (record) => {
      record.agentRuns = [...(record.agentRuns ?? []), run];
      record.updatedAt = run.completedAt;
      record.activity.push({ id: randomUUID(), type: "agent", actor: run.requestedBy, detail: `completed OpenCode session ${run.openCodeSessionId ?? run.id}`, at: run.completedAt, version: record.version });
      return record;
    });
    const snapshot = this.snapshot(updated);
    this.broadcast(id, "agent-queue", snapshot);
    return snapshot;
  }

  async subscribe(id, token, response) {
    const record = this.assertReadable(await this.store.get(id), token);
    const clients = this.clients.get(id) ?? new Set();
    clients.add(response);
    this.clients.set(id, clients);
    response.write(`event: workspace\ndata: ${JSON.stringify(this.snapshot(record))}\n\n`);
    return () => clients.delete(response);
  }

  broadcast(id, event, payload) {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients.get(id) ?? []) {
      try { client.write(message); } catch { this.clients.get(id)?.delete(client); }
    }
  }
}

export const sessionInternals = { tokenHash, safeTokenMatch, normalizeRepository };
