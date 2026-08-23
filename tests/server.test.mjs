import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPassOnServer } from "../src/server.mjs";
import { PassOnClient } from "../src/client.mjs";

const capsule = {
  title: "Cross-harness resume",
  goal: "Resume this task in another harness.",
  state: { completed: ["Checkpoint created"] },
  constraints: ["Verify before editing"],
  nextAction: "Load the checkpoint and restate the goal.",
  source: { harness: "test" },
};

async function withServer(fn, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "passon-test-"));
  const server = await createPassOnServer({
    dataDir,
    podDir: path.join(dataDir, "pods"),
    workPodMode: "local",
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("create, render, accept, and read receipt end to end", async () => {
  await withServer(async (origin) => {
    const landing = await fetch(origin);
    assert.equal(landing.status, 200);
    const landingHtml = await landing.text();
    assert.match(landingHtml, /Forge Agent Workspace/);
    assert.match(landingHtml, /<passon-button/);
    const landingHead = await fetch(origin, { method: "HEAD" });
    assert.equal(landingHead.status, 200);
    assert.match(landingHead.headers.get("content-type"), /^text\/html/);

    const createdResponse = await fetch(`${origin}/v1/passons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capsule, ttlHours: 24 }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.match(created.shareUrl, /^http:\/\/127\.0\.0\.1:.+\/receiver#id=/);

    const headers = { authorization: `Bearer ${created.token}` };
    const recordResponse = await fetch(`${origin}/v1/passons/${created.id}`, { headers });
    assert.equal(recordResponse.status, 200);
    const record = await recordResponse.json();
    assert.equal(record.status, "sealed");
    assert.equal(record.tokenHash, undefined);

    const unauthorized = await fetch(`${origin}/v1/passons/${created.id}`);
    assert.equal(unauthorized.status, 403);

    const rendered = await fetch(`${origin}/v1/passons/${created.id}/render?target=cursor`, { headers });
    assert.equal(rendered.status, 200);
    assert.match(await rendered.text(), /Open the relevant project in Cursor/);

    const accepted = await fetch(`${origin}/v1/passons/${created.id}/accept`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        actor: "worker-2",
        harness: "cursor",
        restatedGoal: capsule.goal,
        firstAction: capsule.nextAction,
        observedDigest: record.digest,
      }),
    });
    assert.equal(accepted.status, 201);

    const finalRecord = await (await fetch(`${origin}/v1/passons/${created.id}`, { headers })).json();
    assert.equal(finalRecord.status, "accepted");
    assert.equal(finalRecord.receipts[0].actor, "worker-2");
  });
});

test("secret-bearing capsules fail closed", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/v1/passons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capsule: { ...capsule, traceSummary: `ghp_${"a".repeat(24)}` } }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.deepEqual(body.matches, ["GitHub token"]);
    assert.doesNotMatch(body.message, /ghp_/);
  });
});

test("cost endpoint returns transparent assumptions", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/v1/cost-estimate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passonsPerMonth: 100 }),
    });
    assert.equal(response.status, 200);
    const estimate = await response.json();
    assert.equal(estimate.assumptions.passonsPerMonth, 100);
    assert.match(estimate.warning, /not empirical proof/);
  });
});

test("JavaScript client transfers and pulls the same capsule across harness renderers", async () => {
  await withServer(async (origin) => {
    const client = new PassOnClient(origin);
    const created = await client.create(capsule, { ttlHours: 4, workPod: true });
    const record = await client.read(created.shareUrl);
    assert.equal(record.capsule.goal, capsule.goal);
    assert.match(await client.render(created.shareUrl, "claude"), /Claude Code/);
    const pulled = await client.pull(created.shareUrl, "claude");
    assert.equal(pulled.record.digest, record.digest);
    assert.match(pulled.resumePrompt, /Claude Code/);
    assert.equal(pulled.workPod.camp.digest, record.digest);
    const accepted = await client.accept(created.shareUrl, {
      actor: "agent-sdk",
      harness: "claude",
      restatedGoal: capsule.goal,
      firstAction: capsule.nextAction,
    });
    assert.equal(accepted.status, "accepted");
  });
});

test("work pod packages and returns sealed tribal context", async () => {
  await withServer(async (origin) => {
    const createdResponse = await fetch(`${origin}/v1/passons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capsule, workPod: { requested: true } }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.workPod.provider, "local-demo");
    assert.equal(created.workPod.state, "ready");

    const podResponse = await fetch(`${origin}/v1/passons/${created.id}/pod`, {
      headers: { authorization: `Bearer ${created.token}` },
    });
    assert.equal(podResponse.status, 200);
    const pod = await podResponse.json();
    assert.equal(pod.camp.digest, created.digest);
    assert.match(pod.handoff, /Cross-harness resume/);
    assert.deepEqual(pod.files, ["CAMP.json", "HANDOFF.md", "manifest.json"]);
  });
});

test("capability holder can run a configured autonomous harness and terminate the pod", async () => {
  const fakeRunner = {
    status: () => ({ configured: true, harness: "test-5090", transport: "ssh" }),
    run: async () => ({
      id: "agent-run-1",
      harness: "test-5090",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 4,
      exitCode: 0,
      stdout: "continued safely",
      stderr: "",
    }),
  };
  await withServer(async (origin) => {
    const client = new PassOnClient(origin);
    const created = await client.create(capsule, { workPod: true });
    const run = await client.runAgent(created.shareUrl, "generic");
    assert.equal(run.status, "agent-completed");
    assert.equal(run.result.harness, "test-5090");
    assert.match(run.workPod.files.at(-1), /^agents\//);

    const record = await client.read(created.shareUrl);
    assert.equal(record.agentRuns[0].artifact, "agents/agent-run-1.json");

    const terminated = await client.terminateWorkPod(created.shareUrl);
    assert.equal(terminated.workPod.state, "terminated");
  }, { agentRunner: fakeRunner });
});
