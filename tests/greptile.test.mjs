import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { greptileHandoffCapsule, normalizeGreptileFinding } from "../src/greptile.mjs";
import { createRecord } from "../src/protocol.mjs";
import { createRelayServer } from "../src/server.mjs";

const finding = {
  id: "review-comment-42",
  repository: "acme/checkout-service",
  prUrl: "https://github.com/acme/checkout-service/pull/42",
  sha: "abc123",
  summary: "Retry workers bypass merchant validation through the legacy parser fallback.",
  severity: "high",
  confidence: "high",
  paths: ["src/parser.ts", "src/retry-worker.ts"],
  evidence: ["retryWorker calls parseLegacy before validateMerchant"],
};

test("normalizes Greptile provenance without claiming live authentication", () => {
  const normalized = normalizeGreptileFinding(finding);
  assert.equal(normalized.source, "greptile");
  assert.equal(normalized.sourceMode, "local-demo");
  assert.deepEqual(normalized.affectedPaths, finding.paths);
});

test("turns a Greptile finding and investigation into sealed operational memories", () => {
  const capsule = greptileHandoffCapsule({
    finding,
    investigation: {
      completed: ["Reproduced with the malformed merchant fixture"],
      decisions: ["Keep strict merchant validation"],
      constraints: ["Do not change the public payload schema"],
      rejectedApproaches: ["Schema-wide relaxation"],
      nextAction: "Run the full checkout suite.",
    },
  }, { trustedAdapter: true });
  const { record } = createRecord(capsule, { token: "test-token" });
  assert.equal(record.capsule.memories[0].source, "greptile");
  assert.equal(record.capsule.memories.at(-1).type, "next-action");
  assert.match(record.capsule.traceSummary, /Greptile API retrieval not independently verified/);
  assert.equal(record.capsule.integration, undefined, "unknown unsealed extension fields are dropped");
});

test("includes a bounded text context drop without claiming it is verified", () => {
  const capsule = greptileHandoffCapsule({
    finding,
    contextDrop: { name: "trace.log", mediaType: "text/plain", content: "step 2 resumed at position 0" },
  });
  const dropped = capsule.memories.find((item) => item.source === "user-1-context-drop");
  assert.match(dropped.summary, /trace\.log/);
  assert.equal(dropped.confidence, "medium");
  assert.ok(capsule.artifacts.some((item) => item.label === "Context drop: trace.log"));
});

test("local Greptile adapter creates a real work-pod handoff and labels demo mode", {
  skip: Number(process.versions.node.split(".")[0]) === 24
    ? "Node 24.3 has a native HTTP test-runner assertion; run integration tests on supported Node 20 or 22."
    : false,
}, async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "relay-greptile-test-"));
  const server = await createRelayServer({
    dataDir,
    podDir: path.join(dataDir, "pods"),
    workPodMode: "local",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/v1/integrations/greptile/handoffs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        finding,
        investigation: { nextAction: "Run the targeted retry-worker test." },
      }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.integration.mode, "local-demo");
    assert.ok(created.integration.memories >= 3);
    assert.equal(created.workPod.provider, "local-demo");

    const capability = new URL(created.shareUrl);
    const id = capability.hash.match(/id=([^&]+)/)[1];
    const token = capability.hash.match(/token=([^&]+)/)[1];
    const recordResponse = await fetch(`${origin}/v1/relays/${id}?token=${token}`);
    assert.equal(recordResponse.status, 200);
    const record = await recordResponse.json();
    assert.equal(record.capsule.memories[0].source, "greptile");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
