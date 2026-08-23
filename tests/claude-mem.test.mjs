import assert from "node:assert/strict";
import test from "node:test";
import { ClaudeMemClient } from "../src/claude-mem.mjs";

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("reports the installed worker without exposing credentials", async () => {
  const client = new ClaudeMemClient({ fetch: async () => response({ status: "ok", version: "13.15.3", mcpReady: true, ai: { provider: "openrouter", authMethod: "Claude Code OAuth token" } }) });
  assert.deepEqual(await client.status(), { connected: true, version: "13.15.3", provider: "openrouter", authMethod: "Claude Code OAuth token" });
});

test("search preserves observation IDs as provenance", async () => {
  const client = new ClaudeMemClient({ fetch: async () => response({ content: [{ type: "text", text: "| #431 | decision | Keep one-button flow |\n| #512 | bugfix | Shared room |" }] }) });
  const result = await client.search({ query: "Relay", project: "relay" });
  assert.deepEqual(result.observationIds, [431, 512]);
  assert.equal(result.provenance.source, "claude-mem");
  assert.equal(result.empty, false);
});
