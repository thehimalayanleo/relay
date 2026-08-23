#!/usr/bin/env node

const server = (process.env.RELAY_SERVER ?? "http://127.0.0.1:4317").replace(/\/$/, "");

async function request(path, init = {}) {
  const response = await fetch(`${server}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

const created = await request("/v1/sessions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Build the AGI-ARC-3 long-horizon harness",
    creatorRole: "swe",
    repository: { name: "thehimalayanleo/relay", prNumber: null, remote: "github", defaultBranch: "main" },
  }),
});
const headers = { authorization: `Bearer ${created.token}`, "content-type": "application/json" };

await request(`/v1/sessions/${created.id}/join`, {
  method: "POST", headers,
  body: JSON.stringify({ id: "ajinkya-swe", name: "Ajinkya", role: "SWE", color: "#7aa2f7" }),
});
await request(`/v1/sessions/${created.id}/join`, {
  method: "POST", headers,
  body: JSON.stringify({ id: "sanjana-swe", name: "Sanjana", role: "SWE", color: "#ff5a1f" }),
});

await request(`/v1/sessions/${created.id}/brief`, {
  method: "POST", headers,
  body: JSON.stringify({ actor: "Ajinkya", actorId: "ajinkya-swe", field: "implementation", value: "Add resumable episode state to the AGI-ARC-3 harness." }),
});
const feedback = "Before continuing, reject stale restored observations and add a fresh-reset replay test that proves the action budget is preserved.";
await request(`/v1/sessions/${created.id}/brief`, {
  method: "POST", headers,
  body: JSON.stringify({ actor: "Sanjana", actorId: "sanjana-swe", field: "constraint", value: feedback }),
});
await request(`/v1/sessions/${created.id}/brief`, {
  method: "POST", headers,
  body: JSON.stringify({ actor: "Sanjana", actorId: "sanjana-swe", field: "implementation", value: "Implement Sanjana's fresh-reset replay guard, then run the ARC harness tests." }),
});

const checkpoint = await request(`/v1/sessions/${created.id}/checkpoints`, {
  method: "POST", headers,
  body: JSON.stringify({ actor: "Sanjana · SWE" }),
});
const run = await request(`/v1/sessions/${created.id}/agent/run`, {
  method: "POST", headers,
  body: JSON.stringify({ target: "opencode", requestedBy: "Ajinkya · SWE", demo: true }),
});
const session = await request(`/v1/sessions/${created.id}`, { headers });
const agentRun = session.agentRuns.at(-1);

if (session.brief.constraint !== feedback) throw new Error("Sanjana's feedback was not preserved in the shared brief.");
if (agentRun.inheritedContext?.constraint !== feedback) throw new Error("The continuing agent did not inherit Sanjana's exact feedback.");
if (!agentRun.response) throw new Error("The continuing agent response was not retained.");
if (agentRun.sailboxId !== checkpoint.workPod.sailboxId) throw new Error("The agent did not continue from the shared Sailbox.");

console.log(JSON.stringify({
  status: "verified",
  scenario: "Ajinkya starts AGI-ARC-3; Sanjana contributes SWE feedback; Ajinkya's agent continues with it",
  sessionId: created.id,
  hostWorkspaceUrl: created.hostWorkspaceUrl,
  collaboratorInviteUrl: created.collaboratorInviteUrl,
  sailboxId: agentRun.sailboxId,
  feedback,
  inheritedConstraint: agentRun.inheritedContext.constraint,
  agentResponse: agentRun.response,
  openCodeSessionId: agentRun.openCodeSessionId,
  queueMode: run.queue.mode,
}, null, 2));
