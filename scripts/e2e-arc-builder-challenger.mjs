#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const server = (process.env.RELAY_SERVER ?? "http://127.0.0.1:4317").replace(/\/$/, "");
const repositoryRoot = path.resolve(process.env.SAVEPOINT_REPO ?? "savepoint-demo");
const required = [
  "arc/results/runevals_arc_report_v9.json",
  "arc/results/feature_accuracy_timeline.json",
  "arc/visible_responsive_fsm_solver.py",
  "arc/render_initial_boards.py",
  "arc/render_action_probes.py",
];

async function request(route, init = {}) {
  const response = await fetch(`${server}${route}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

const missing = [];
for (const relative of required) {
  try { await access(path.join(repositoryRoot, relative)); } catch { missing.push(relative); }
}

const [builderPrompt, challengerPrompt] = await Promise.all([
  readFile(new URL("../examples/arc-user1-builder.md", import.meta.url), "utf8"),
  readFile(new URL("../examples/arc-user2-challenger.md", import.meta.url), "utf8"),
]);
const repositoryName = process.env.RELAY_SESSION_REPO ?? "savepoint-demo";
const repositoryPr = Number(process.env.RELAY_SESSION_PR ?? 0) || null;
const created = await request("/v1/sessions", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "ARC-AGI-3 builder and challenger", creatorRole: "swe", repository: { name: repositoryName, prNumber: repositoryPr } }),
});
const headers = { authorization: `Bearer ${created.token}`, "content-type": "application/json" };
for (const participant of [{ id: "user-1", name: "Ajinkya", role: "Primary builder" }, { id: "user-2", name: "Sanjana", role: "Independent challenger" }]) {
  await request(`/v1/sessions/${created.id}/join`, { method: "POST", headers, body: JSON.stringify(participant) });
}
await request(`/v1/sessions/${created.id}/brief`, { method: "POST", headers, body: JSON.stringify({ actor: "Ajinkya", actorId: "user-1", field: "problem", value: builderPrompt }) });
await request(`/v1/sessions/${created.id}/brief`, { method: "POST", headers, body: JSON.stringify({ actor: "Sanjana", actorId: "user-2", field: "constraint", value: challengerPrompt }) });
await request(`/v1/sessions/${created.id}/brief`, { method: "POST", headers, body: JSON.stringify({ actor: "Sanjana", actorId: "user-2", field: "implementation", value: "Return a structured challenger handoff. The primary builder must independently replay and deduplicate any candidate before promotion." }) });

const checkpoint = await request(`/v1/sessions/${created.id}/checkpoints`, { method: "POST", headers, body: JSON.stringify({ actor: "Sanjana · independent challenger" }) });
const run = (requestedBy, instructions) => request(`/v1/sessions/${created.id}/agent/run`, { method: "POST", headers, body: JSON.stringify({ target: "opencode", requestedBy, instructions }) });
await Promise.all([run("User 1 · primary builder", builderPrompt), run("User 2 · independent challenger", challengerPrompt)]);
const session = await request(`/v1/sessions/${created.id}`, { headers });
const runs = session.agentRuns.slice(-2);
const sailboxes = new Set(runs.map((item) => item.sailboxId));
const distinctSessions = new Set(runs.map((item) => item.openCodeSessionId));
if (!session.brief.problem.includes("fresh-reset replay")) throw new Error("Builder contract was not retained.");
if (!session.brief.constraint.includes("do not promote")) throw new Error("Challenger contract was not retained.");
if (runs.length !== 2 || sailboxes.size !== 1 || distinctSessions.size !== 2) throw new Error("Expected two OpenCode sessions sharing one Sailbox.");
if (new Date(runs[1].startedAt) < new Date(runs[0].completedAt)) throw new Error("Agent executions overlapped instead of serializing.");

console.log(JSON.stringify({
  relayE2E: "verified",
  benchmarkExecution: missing.length ? "blocked_missing_repository" : "ready_for_bounded_run",
  missingArtifacts: missing,
  sessionId: created.id,
  hostWorkspaceUrl: created.hostWorkspaceUrl,
  collaboratorInviteUrl: created.collaboratorInviteUrl,
  sailboxId: checkpoint.workPod.sailboxId,
  openCodeSessions: runs.map((item) => item.openCodeSessionId),
  queue: "serialized",
  builderContractRetained: true,
  challengerContractRetained: true,
  globalScorePromoted: false,
}, null, 2));
