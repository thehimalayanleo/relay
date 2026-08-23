#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const server = (process.env.RELAY_SERVER ?? "http://127.0.0.1:4318").replace(/\/$/, "");
const repositoryRoot = path.resolve(process.env.SAVEPOINT_REPO ?? "savepoint-demo");
const builderBurst = Math.max(1, Number(process.env.RELAY_ARC_BUILDER_BURST ?? 10));
const cycles = Math.max(1, Number(process.env.RELAY_ARC_CYCLES ?? 1));
const repositoryName = process.env.RELAY_SESSION_REPO ?? "savepoint-demo";
const repositoryPr = Number(process.env.RELAY_SESSION_PR ?? 0) || null;

async function request(route, init = {}) {
  const response = await fetch(`${server}${route}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

for (const relative of [
  "arc/results/runevals_arc_report_v9.json",
  "arc/results/feature_accuracy_timeline.json",
  "arc/visible_responsive_fsm_solver.py",
  "arc/render_initial_boards.py",
  "arc/render_action_probes.py",
]) await access(path.join(repositoryRoot, relative));

const [builderPrompt, challengerPrompt] = await Promise.all([
  readFile(new URL("../examples/arc-user1-builder.md", import.meta.url), "utf8"),
  readFile(new URL("../examples/arc-user2-challenger.md", import.meta.url), "utf8"),
]);
const created = await request("/v1/sessions", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Live ARC-AGI-3 autonomous relay", creatorRole: "swe", repository: { name: repositoryName, prNumber: repositoryPr } }),
});
const headers = { authorization: `Bearer ${created.token}`, "content-type": "application/json" };
console.log(JSON.stringify({ status: "running", cadence: `${builderBurst} builder : 1 challenger`, cycles, hostWorkspaceUrl: created.hostWorkspaceUrl, collaboratorInviteUrl: created.collaboratorInviteUrl }, null, 2));

for (const participant of [{ id: "user-1", name: "Ajinkya", role: "Primary builder" }, { id: "user-2", name: "Sanjana", role: "Independent challenger" }]) {
  await request(`/v1/sessions/${created.id}/join`, { method: "POST", headers, body: JSON.stringify(participant) });
}
await request(`/v1/sessions/${created.id}/brief`, { method: "POST", headers, body: JSON.stringify({ actor: "Ajinkya", actorId: "user-1", field: "problem", value: builderPrompt }) });
await request(`/v1/sessions/${created.id}/brief`, { method: "POST", headers, body: JSON.stringify({ actor: "Sanjana", actorId: "user-2", field: "constraint", value: challengerPrompt }) });
await request(`/v1/sessions/${created.id}/brief`, { method: "POST", headers, body: JSON.stringify({ actor: "Relay", actorId: "relay", field: "implementation", value: "Run one bounded ARC experiment, preserve exact evidence, and continue autonomously through the serialized queue." }) });
const checkpoint = await request(`/v1/sessions/${created.id}/checkpoints`, { method: "POST", headers, body: JSON.stringify({ actor: "Relay autonomous loop" }) });

const run = (requestedBy, instructions) => request(`/v1/sessions/${created.id}/agent/run`, {
  method: "POST", headers, body: JSON.stringify({ target: "opencode", requestedBy, instructions }),
});
for (let cycle = 1; cycle <= cycles; cycle += 1) {
  for (let step = 1; step <= builderBurst; step += 1) {
    await run("Ajinkya agent · primary builder", `${builderPrompt}\n\nCadence: cycle ${cycle}, builder step ${step}/${builderBurst}. Perform exactly one bounded next experiment, inspect the real workspace, and leave a precise continuation for the next serialized run.`);
  }
  await run("Sanjana agent · independent challenger", `${challengerPrompt}\n\nCadence: cycle ${cycle}, challenger audit after ${builderBurst} builder steps. Audit the accumulated outputs and prescribe the next bounded correction.`);
  if (repositoryPr) await request(`/v1/sessions/${created.id}/greptile/sync`, { method: "POST", headers }).catch(() => null);
}

const session = await request(`/v1/sessions/${created.id}`, { headers });
console.log(JSON.stringify({ status: "complete", sessionId: created.id, sailboxId: checkpoint.workPod.sailboxId, runs: session.agentRuns.length, metrics: session.greptile.samples.at(-1) ?? null, scorePromoted: false }, null, 2));
