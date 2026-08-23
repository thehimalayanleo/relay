import assert from "node:assert/strict";
import test from "node:test";
import { GreptileMcpClient } from "../src/greptile-mcp.mjs";

test("Greptile MCP client authenticates and parses tool content", async () => {
  const requests = [];
  const client = new GreptileMcpClient({
    apiKey: "test-key",
    fetch: async (_url, options) => {
      requests.push(options);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        result: { content: [{ type: "text", text: JSON.stringify({ comments: [1] }) }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await client.callTool("list_merge_request_comments", { name: "acme/repo" });
  assert.deepEqual(result, { comments: [1] });
  assert.equal(requests[0].headers.authorization, "Bearer test-key");
  assert.equal(JSON.parse(requests[0].body).method, "tools/call");
});

test("Greptile MCP client fails closed without a key", async () => {
  const client = new GreptileMcpClient({ apiKey: "" });
  await assert.rejects(() => client.initialize(), { code: "GREPTILE_NOT_CONFIGURED" });
});
