import assert from "node:assert/strict";
import test from "node:test";
import { AgentRunQueue } from "../src/agent-queue.mjs";

test("serializes model execution for one Relay checkpoint", async () => {
  const queue = new AgentRunQueue();
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = queue.enqueue("relay-1", { target: "claude", requestedBy: "Sanjana" }, async () => {
    order.push("first-start");
    await firstGate;
    order.push("first-end");
    return "first";
  });
  const second = queue.enqueue("relay-1", { target: "opencode", requestedBy: "Ajinkya" }, async () => {
    order.push("second-start");
    return "second";
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queue.status("relay-1").active.target, "claude");
  assert.equal(queue.status("relay-1").waiting[0].target, "opencode");
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(order, ["first-start", "first-end", "second-start"]);
  assert.equal(queue.status("relay-1").completed, 2);
});

test("different Relay checkpoints can execute independently", async () => {
  const queue = new AgentRunQueue();
  const result = await Promise.all([
    queue.enqueue("a", { target: "codex" }, async () => "a"),
    queue.enqueue("b", { target: "claude" }, async () => "b"),
  ]);
  assert.deepEqual(result, ["a", "b"]);
});
