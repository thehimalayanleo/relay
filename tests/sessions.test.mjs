import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SessionFileStore, SessionService } from "../src/sessions.mjs";

async function fixture({ greptileClient, now } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "relay-sessions-"));
  const store = new SessionFileStore(root);
  await store.init();
  return { root, store, service: new SessionService({ store, greptileClient, now }) };
}

const repository = { name: "thehimalayanleo/relay", prNumber: 7, defaultBranch: "main" };

test("a local session starts without GitHub", async () => {
  const { service } = await fixture();
  const created = await service.create({ title: "Local investigation" });
  assert.deepEqual(created.record.repository, {
    name: "Local workspace",
    remote: "local",
    defaultBranch: "",
    branch: "",
    prNumber: null,
  });
});

test("a new GitHub repository can start before its first pull request", async () => {
  const { service } = await fixture();
  const created = await service.create({ title: "Start clean", repository: { name: "acme/new-work", prNumber: null } });
  assert.equal(created.record.repository.name, "acme/new-work");
  assert.equal(created.record.repository.prNumber, null);
});

test("session capabilities are hashed, private on disk, and survive restart", async () => {
  const { root, store, service } = await fixture();
  const created = await service.create({ title: "Ship shared sessions", repository });
  const stored = await store.get(created.record.id);
  assert.ok(stored.tokenHash);
  assert.equal(JSON.stringify(stored).includes(created.token), false);
  assert.equal((await stat(path.join(root, `${created.record.id}.json`))).mode & 0o777, 0o600);

  const restarted = new SessionService({ store });
  assert.equal((await restarted.get(created.record.id, created.token)).title, "Ship shared sessions");
  await assert.rejects(restarted.get(created.record.id, "wrong"), { code: "FORBIDDEN" });
});

test("sessions are isolated and persist versioned edits", async () => {
  const { store, service } = await fixture();
  const first = await service.create({ title: "First", repository });
  const second = await service.create({ title: "Second", repository: { ...repository, prNumber: 8 } });
  await service.updateBrief(first.record.id, first.token, { field: "implementation", value: "Queue one agent", actor: "Ajinkya" });
  assert.equal((await service.get(first.record.id, first.token)).version, 1);
  assert.equal((await service.get(second.record.id, second.token)).version, 0);
  assert.equal((await store.get(first.record.id)).brief.implementation, "Queue one agent");
  await assert.rejects(service.get(second.record.id, first.token), { code: "FORBIDDEN" });
});

test("chat activity retains exact collaborator text", async () => {
  const { service } = await fixture();
  const created = await service.create({ title: "Chat", repository });
  await service.addActivity(created.record.id, created.token, { type: "chat", actor: "Sanjana", detail: "Add a replay guard", value: "Add a replay guard" });
  const session = await service.get(created.record.id, created.token);
  assert.equal(session.activity.at(-1).value, "Add a replay guard");
});

test("Greptile metrics close only findings first observed open", async () => {
  let iteration = 0;
  const greptileClient = {
    async listGreptileComments(_repo, addressed) {
      if (iteration === 0) return addressed
        ? { comments: [{ id: "old-addressed", body: "Before session" }] }
        : { comments: [{ id: "a", body: "Open A", path: "src/a.mjs" }, { id: "b", body: "Open B" }] };
      if (iteration === 1) return addressed
        ? { comments: [{ id: "a", body: "Open A" }, { id: "old-addressed", body: "Before session" }] }
        : { comments: [] };
      return addressed ? { comments: [] } : { comments: [{ id: "b", body: "Open B" }] };
    },
  };
  const { service } = await fixture({ greptileClient });
  const created = await service.create({ title: "Metrics", repository });
  let metrics = await service.syncGreptile(created.record.id, created.token);
  assert.deepEqual(metrics.totals, { opened: 2, closed: 0, remaining: 2, unknown: 0 });
  iteration = 1;
  metrics = await service.syncGreptile(created.record.id, created.token);
  assert.deepEqual(metrics.totals, { opened: 2, closed: 1, remaining: 0, unknown: 1 });
  assert.equal(metrics.findings.some((item) => item.id === "old-addressed"), false);
  iteration = 2;
  metrics = await service.syncGreptile(created.record.id, created.token);
  assert.deepEqual(metrics.totals, { opened: 2, closed: 0, remaining: 1, unknown: 1 });
});

test("expired capabilities are rejected", async () => {
  let clock = new Date("2026-08-23T00:00:00Z");
  const { service } = await fixture({ now: () => clock });
  const created = await service.create({ title: "Short session", repository, ttlHours: 1 });
  clock = new Date("2026-08-23T02:00:00Z");
  await assert.rejects(service.get(created.record.id, created.token), { code: "EXPIRED" });
});
