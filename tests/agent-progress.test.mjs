import assert from "node:assert/strict";
import test from "node:test";
import { serverInternals } from "../src/server.mjs";

test("OpenCode text and tool events become readable progress", () => {
  assert.equal(serverInternals.agentProgressSummary(JSON.stringify({ type: "text", part: { text: "Inspecting the replay path" } })), "Writing: Inspecting the replay path");
  assert.equal(serverInternals.agentProgressSummary(JSON.stringify({ type: "tool", part: { tool: "read", state: { status: "running" } } })), "Tool: read · running");
  assert.equal(serverInternals.agentProgressSummary(JSON.stringify({ type: "reasoning", part: { type: "reasoning", text: "Checking the replay invariant" } })), "Thinking: Checking the replay invariant");
});

test("live progress redacts common credential shapes", () => {
  const output = serverInternals.redactAgentProgress("Using token=abc123 and Bearer secret-value");
  assert.equal(output.includes("abc123"), false);
  assert.equal(output.includes("secret-value"), false);
});

test("retained response excludes reasoning blocks", () => {
  const stdout = [
    JSON.stringify({ type: "reasoning", part: { type: "reasoning", text: "private intermediate work" } }),
    JSON.stringify({ type: "text", part: { type: "text", text: "final answer" } }),
  ].join("\n");
  assert.equal(serverInternals.exactAgentResponse(stdout), "final answer");
});
