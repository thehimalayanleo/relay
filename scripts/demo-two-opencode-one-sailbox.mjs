#!/usr/bin/env node

const server = (process.env.RELAY_SERVER ?? "http://127.0.0.1:4317").replace(/\/$/, "");

async function request(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

const created = await request(`${server}/v1/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Two local OpenCode sessions · one Sailbox",
    creatorRole: "swe",
    repository: { name: "thehimalayanleo/relay", prNumber: 1, remote: "github", defaultBranch: "main" },
  }),
});
const authorization = { authorization: `Bearer ${created.token}` };
const checkpoint = await request(`${server}/v1/sessions/${created.id}/checkpoints`, {
  method: "POST",
  headers: { ...authorization, "content-type": "application/json" },
  body: JSON.stringify({ actor: "Relay coordination demo" }),
});

const run = (requestedBy) => request(`${server}/v1/sessions/${created.id}/agent/run`, {
  method: "POST",
  headers: { ...authorization, "content-type": "application/json" },
  body: JSON.stringify({ target: "opencode", requestedBy, demo: true }),
});
const requestedAt = new Date().toISOString();
const [swe, pm] = await Promise.all([run("Ajinkya · SWE"), run("Sanjana · PM")]);
const session = await request(`${server}/v1/sessions/${created.id}`, { headers: authorization });
const pod = await request(`${server}/v1/relays/${checkpoint.id}/pod`, { headers: authorization });
const runs = session.agentRuns.slice(-2);
const sailboxes = [...new Set(runs.map((item) => item.sailboxId))];
const distinctOpenCodeSessions = new Set(runs.map((item) => item.openCodeSessionId)).size;
const agentArtifacts = pod.files.filter((item) => item.startsWith("agents/"));
if (runs.length !== 2 || distinctOpenCodeSessions !== 2 || sailboxes.length !== 1 || agentArtifacts.length !== 2) {
  throw new Error("Coordination proof failed: expected two OpenCode sessions sharing one Sailbox.");
}
if (new Date(runs[1].startedAt).getTime() < new Date(runs[0].completedAt).getTime()) {
  throw new Error("Serialization proof failed: the second model run overlapped the first.");
}

console.log(JSON.stringify({
  status: "verified",
  requestedAt,
  sessionId: created.id,
  hostWorkspaceUrl: created.hostWorkspaceUrl,
  pmInviteUrl: created.pmInviteUrl,
  expiresAt: created.expiresAt,
  checkpointId: checkpoint.id,
  provider: checkpoint.provider,
  sailboxId: sailboxes[0],
  agentArtifacts,
  model: process.env.RELAY_OPENCODE_MODEL ?? "opencode-go/ox-alpha-free",
  queue: { mode: swe.queue.mode, completed: Math.max(swe.queue.completed, pm.queue.completed) },
  runs: runs.map((item) => ({
    requestedBy: item.requestedBy,
    relayRunId: item.id,
    openCodeSessionId: item.openCodeSessionId,
    queueJobId: item.queueJobId,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    exitCode: item.exitCode,
    artifact: item.artifact,
  })),
}, null, 2));
