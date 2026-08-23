function defaultPort() {
  if (process.env.CLAUDE_MEM_WORKER_PORT) return Number(process.env.CLAUDE_MEM_WORKER_PORT);
  const uid = typeof process.getuid === "function" ? process.getuid() : 77;
  return 37_700 + (uid % 100);
}

function textContent(payload) {
  return payload?.content?.find((item) => item.type === "text")?.text ?? "";
}

export class ClaudeMemClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? process.env.CLAUDE_MEM_URL ?? `http://127.0.0.1:${defaultPort()}`;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
      const error = new Error(`Claude-Mem returned HTTP ${response.status}.`);
      error.code = "CLAUDE_MEM_UNAVAILABLE";
      throw error;
    }
    return response.json();
  }

  async status() {
    const health = await this.request("/api/health", { timeoutMs: 3_000 });
    return {
      connected: health.status === "ok" && health.mcpReady === true,
      version: health.version ?? null,
      provider: health.ai?.provider ?? null,
      authMethod: health.ai?.authMethod ?? null,
    };
  }

  async search({ query, project, limit = 8 }) {
    const params = new URLSearchParams({ query, limit: String(Math.min(20, Math.max(1, limit))) });
    if (project) params.set("project", project);
    const payload = await this.request(`/api/search?${params}`);
    const text = textContent(payload);
    const observationIds = [...text.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
    return {
      query,
      project: project || null,
      observationIds: [...new Set(observationIds)],
      text,
      empty: /No results found/i.test(text) || !text.trim(),
      provenance: { source: "claude-mem", transport: "local-worker", worker: this.baseUrl },
    };
  }
}

