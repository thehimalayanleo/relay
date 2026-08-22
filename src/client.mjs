function parseShareUrl(shareUrl) {
  const parsed = new URL(shareUrl);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const id = parsed.searchParams.get("id") ?? fragment.get("id");
  const token = parsed.searchParams.get("token") ?? fragment.get("token");
  if (!id || !token) throw new Error("PassOn share URL must include an id and capability token.");
  return { origin: parsed.origin, id, token };
}

async function responseBody(response) {
  if (response.ok) return response.headers.get("content-type")?.startsWith("application/json")
    ? response.json()
    : response.text();
  const body = await response.json().catch(() => ({}));
  throw new Error(body.message ?? `PassOn request failed with HTTP ${response.status}.`);
}

export class PassOnClient {
  constructor(origin = "http://127.0.0.1:4317", fetchImpl = fetch) {
    this.origin = origin.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  async create(capsule, options = {}) {
    return responseBody(await this.fetch(`${this.origin}/v1/passons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capsule,
        ttlHours: options.ttlHours,
        workPod: { requested: options.workPod === true },
      }),
    }));
  }

  async read(shareUrl) {
    const { origin, id, token } = parseShareUrl(shareUrl);
    return responseBody(await this.fetch(`${origin}/v1/passons/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    }));
  }

  async render(shareUrl, target = "generic") {
    const { origin, id, token } = parseShareUrl(shareUrl);
    return responseBody(await this.fetch(`${origin}/v1/passons/${id}/render?target=${encodeURIComponent(target)}`, {
      headers: { authorization: `Bearer ${token}` },
    }));
  }

  async pullWorkPod(shareUrl) {
    const { origin, id, token } = parseShareUrl(shareUrl);
    return responseBody(await this.fetch(`${origin}/v1/passons/${id}/pod`, {
      headers: { authorization: `Bearer ${token}` },
    }));
  }

  async pull(shareUrl, target = "generic") {
    const [record, resumePrompt, workPod] = await Promise.all([
      this.read(shareUrl),
      this.render(shareUrl, target),
      this.pullWorkPod(shareUrl).catch((error) => ({ unavailable: true, reason: error.message })),
    ]);
    return { record, resumePrompt, workPod };
  }

  async accept(shareUrl, receipt) {
    const { origin, id, token } = parseShareUrl(shareUrl);
    const record = await this.read(shareUrl);
    return responseBody(await this.fetch(`${origin}/v1/passons/${id}/accept`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...receipt, observedDigest: record.digest }),
    }));
  }
}
