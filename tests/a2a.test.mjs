import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createPassOnServer } from "../src/server.mjs";

const capsule = {
  title: "A2A continuation",
  goal: "Transfer this work through an A2A peer.",
  state: { completed: ["Sealed the checkpoint"] },
  nextAction: "Pull and verify the checkpoint.",
  source: { harness: "user-one" },
};

async function withServer(fn, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "passon-a2a-test-"));
  const server = await createPassOnServer({
    dataDir,
    podDir: path.join(dataDir, "pods"),
    workPodMode: "local",
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createHandoff(origin) {
  const response = await fetch(`${origin}/v1/passons`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capsule, workPod: { requested: true } }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

function rpcBody(shareUrl, passon = {}) {
  return {
    jsonrpc: "2.0",
    id: "request-1",
    method: "SendMessage",
    params: {
      message: {
        messageId: randomUUID(),
        role: "ROLE_USER",
        parts: passon.action
          ? [{ data: { passon: { shareUrl, ...passon } }, mediaType: "application/json" }]
          : [{ text: `Please continue from ${shareUrl}`, mediaType: "text/plain" }],
      },
    },
  };
}

async function callA2a(origin, body, headers = {}) {
  return fetch(`${origin}/a2a`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "a2a-version": "1.0",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("publishes an honest A2A v1 Agent Card", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/.well-known/agent-card.json`);
    assert.equal(response.status, 200);
    const card = await response.json();
    assert.deepEqual(card.supportedInterfaces, [{
      url: `${origin}/a2a`,
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    }]);
    assert.equal(card.capabilities.streaming, false);
    assert.deepEqual(card.securitySchemes, {});
    assert.deepEqual(card.securityRequirements, []);
    assert.match(card.skills[0].description, /capability URL authorizes only its named handoff/);
  });
});

test("SendMessage pulls a PassOn capability into a direct A2A message", async () => {
  await withServer(async (origin) => {
    const created = await createHandoff(origin);
    const response = await callA2a(origin, rpcBody(created.shareUrl));
    assert.equal(response.status, 200);
    const rpc = await response.json();
    assert.equal(rpc.jsonrpc, "2.0");
    assert.equal(rpc.id, "request-1");
    assert.equal(rpc.result.message.role, "ROLE_AGENT");
    assert.equal(rpc.result.message.parts[1].data.action, "pull");
    assert.equal(rpc.result.message.parts[1].data.record.digest, created.digest);
    assert.equal(rpc.result.message.parts[1].data.workPod.camp.digest, created.digest);
    assert.equal(rpc.result.message.metadata.authorization, "capability-url");
    assert.equal(JSON.stringify(rpc).includes(created.token), false);
  });
});

test("SendMessage can invoke the configured autonomous harness", async () => {
  const runner = {
    status: () => ({ configured: true, harness: "test-harness", transport: "process" }),
    run: async () => ({
      id: "a2a-run-1",
      harness: "test-harness",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 3,
      exitCode: 0,
      stdout: "continued",
      stderr: "",
    }),
  };
  await withServer(async (origin) => {
    const created = await createHandoff(origin);
    const response = await callA2a(origin, rpcBody(created.shareUrl, {
      action: "agent-run",
      target: "generic",
    }));
    const rpc = await response.json();
    const output = rpc.result.message.parts[1].data;
    assert.equal(output.action, "agent-run");
    assert.equal(output.status, "agent-completed");
    assert.equal(output.result.harness, "test-harness");
    assert.match(output.workPod.files.at(-1), /^agents\//);
  }, { agentRunner: runner });
});

test("A2A errors use standard JSON-RPC codes and do not reveal capability validity", async () => {
  await withServer(async (origin) => {
    const created = await createHandoff(origin);
    const noVersion = await fetch(`${origin}/a2a`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpcBody(created.shareUrl)),
    });
    assert.equal((await noVersion.json()).error.code, -32009);

    const invalid = new URL(created.shareUrl);
    invalid.hash = `id=${created.id}&token=wrong`;
    const denied = await callA2a(origin, rpcBody(invalid.toString()));
    const deniedRpc = await denied.json();
    assert.equal(deniedRpc.error.code, -32001);
    assert.equal(deniedRpc.error.message, "PassOn handoff is unavailable.");

    const badMethod = await callA2a(origin, { ...rpcBody(created.shareUrl), method: "message/send" });
    assert.equal((await badMethod.json()).error.code, -32601);
  });
});
