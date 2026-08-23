const DEFAULT_ENDPOINT = "https://api.greptile.com/mcp";

export class GreptileMcpClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? process.env.GREPTILE_API_KEY ?? "";
    this.endpoint = options.endpoint ?? process.env.GREPTILE_MCP_URL ?? DEFAULT_ENDPOINT;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  configured() {
    return Boolean(this.apiKey);
  }

  async request(method, params = {}, options = {}) {
    if (!this.apiKey) {
      const error = new Error("GREPTILE_API_KEY is not configured.");
      error.code = "GREPTILE_NOT_CONFIGURED";
      throw error;
    }
    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
    if (!response.ok) {
      const error = new Error(`Greptile MCP returned HTTP ${response.status}.`);
      error.code = "GREPTILE_UNAVAILABLE";
      throw error;
    }
    const envelope = await response.json();
    if (envelope.error) {
      const error = new Error(envelope.error.message ?? "Greptile MCP request failed.");
      error.code = "GREPTILE_MCP_ERROR";
      throw error;
    }
    return envelope.result;
  }

  initialize() {
    return this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "relay", version: "0.1.0" },
    });
  }

  async callTool(name, args = {}) {
    const result = await this.request("tools/call", { name, arguments: args });
    if (result?.isError) {
      const message = result.content?.find((item) => item.type === "text")?.text;
      const error = new Error(message ?? `Greptile tool ${name} failed.`);
      error.code = "GREPTILE_TOOL_ERROR";
      throw error;
    }
    const text = result?.content?.find((item) => item.type === "text")?.text;
    if (!text) return result?.structuredContent ?? result ?? {};
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }

  listOpenPullRequests(limit = 10) {
    return this.callTool("list_pull_requests", { state: "open", limit });
  }

  listGreptileComments(repository, addressed = false) {
    return this.callTool("list_merge_request_comments", {
      name: repository.name,
      remote: repository.remote ?? "github",
      defaultBranch: repository.defaultBranch ?? "main",
      prNumber: repository.prNumber,
      greptileGenerated: true,
      addressed: Boolean(addressed),
    });
  }

  triggerCodeReview(repository) {
    return this.callTool("trigger_code_review", {
      name: repository.name,
      remote: repository.remote ?? "github",
      defaultBranch: repository.defaultBranch ?? "main",
      branch: repository.branch,
      prNumber: repository.prNumber,
    });
  }
}
