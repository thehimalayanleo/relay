import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILES = ["CAMP.json", "HANDOFF.md", "manifest.json"];

function assertPodId(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid work pod id.");
}

function handoffMarkdown(capsule, digest) {
  const completed = capsule.state.completed.length
    ? capsule.state.completed.map((item) => `- ${item}`).join("\n")
    : "- None recorded";
  return `# ${capsule.title}\n\nDigest: ${digest}\n\n## Objective\n\n${capsule.goal}\n\n## Completed\n\n${completed}\n\n## Next safe action\n\n${capsule.nextAction}\n`;
}

function campBundle(capsule, digest) {
  return { schemaVersion: "camp/0.1", digest, capsule };
}

function manifest(metadata) {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

export class LocalWorkPodProvider {
  constructor(root) {
    this.root = root;
    this.name = "local-demo";
  }

  async init() {
    await mkdir(this.root, { recursive: true });
  }

  status() {
    return { provider: this.name, configured: true, remote: false };
  }

  async create({ id, capsule, digest }) {
    assertPodId(id);
    const podRoot = path.join(this.root, id);
    await mkdir(podRoot, { recursive: false, mode: 0o700 });
    const metadata = {
      provider: this.name,
      id,
      state: "ready",
      cpu: "on-demand",
      createdAt: new Date().toISOString(),
      files: [...FILES],
    };
    await writeFile(path.join(podRoot, "CAMP.json"), `${JSON.stringify(campBundle(capsule, digest), null, 2)}\n`, { mode: 0o600 });
    await writeFile(path.join(podRoot, "HANDOFF.md"), handoffMarkdown(capsule, digest), { mode: 0o600 });
    await writeFile(path.join(podRoot, "manifest.json"), manifest(metadata), { mode: 0o600 });
    return metadata;
  }

  async pull(metadata) {
    assertPodId(metadata.id);
    const podRoot = path.join(this.root, metadata.id);
    return {
      ...metadata,
      camp: JSON.parse(await readFile(path.join(podRoot, "CAMP.json"), "utf8")),
      handoff: await readFile(path.join(podRoot, "HANDOFF.md"), "utf8"),
    };
  }

  async storeAgentResult(metadata, result) {
    assertPodId(metadata.id);
    const relativePath = `agents/${result.id}.json`;
    const target = path.join(this.root, metadata.id, relativePath);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    return { ...metadata, files: [...new Set([...metadata.files, relativePath])] };
  }

  async terminate(metadata) {
    return { ...metadata, state: "terminated", terminatedAt: new Date().toISOString() };
  }
}

export class SailWorkPodProvider {
  constructor(options = {}) {
    this.name = "sail";
    this.appName = options.appName ?? process.env.SAIL_APP_NAME ?? "relay";
    this.private = options.private ?? true;
    this.sdkLoader = options.sdkLoader ?? (() => import("@sailresearch/sdk"));
    this.client = options.client;
  }

  async init() {
    if (!process.env.SAIL_API_KEY && !this.client) {
      const error = new Error("SAIL_API_KEY is required when RELAY_WORK_POD_PROVIDER=sail.");
      error.code = "SAIL_NOT_CONFIGURED";
      throw error;
    }
    await this.#sdk();
  }

  status() {
    return {
      provider: this.name,
      configured: Boolean(process.env.SAIL_API_KEY || this.client),
      remote: true,
      appName: this.appName,
    };
  }

  async #sdk() {
    const sdk = await this.sdkLoader();
    if (!this.client) this.client = sdk.Client.fromEnv();
    return sdk;
  }

  async #box(sailboxId) {
    const { Sailbox } = await this.#sdk();
    return Sailbox.get(sailboxId, { client: this.client });
  }

  async #runningBox(metadata) {
    const box = await this.#box(metadata.sailboxId);
    if (["paused", "sleeping"].includes(box.status)) await box.resume();
    if (["failed", "terminated"].includes(box.status)) {
      const error = new Error(`Sailbox ${metadata.sailboxId} is ${box.status} and cannot be resumed.`);
      error.code = "POD_UNAVAILABLE";
      throw error;
    }
    return box;
  }

  async create({ id, capsule, digest }) {
    assertPodId(id);
    const { App, Sailbox } = await this.#sdk();
    const app = await App.find(this.appName, { mintIfMissing: true, client: this.client });
    const box = await Sailbox.create({
      app,
      name: `relay-${id}`,
      private: this.private,
      client: this.client,
    });
    const rootPath = `/opt/relay/handoffs/${id}`;
    const createdAt = new Date().toISOString();
    const metadata = {
      provider: this.name,
      id,
      sailboxId: box.sailboxId,
      appId: app.id,
      appName: app.name,
      rootPath,
      state: "writing",
      cpu: "running",
      createdAt,
      files: [...FILES],
    };

    try {
      await box.fs.write(`${rootPath}/CAMP.json`, `${JSON.stringify(campBundle(capsule, digest), null, 2)}\n`, { mode: 0o600 });
      await box.fs.write(`${rootPath}/HANDOFF.md`, handoffMarkdown(capsule, digest), { mode: 0o600 });
      const sealed = { ...metadata, state: "paused", cpu: "paused", pausedAt: new Date().toISOString() };
      await box.fs.write(`${rootPath}/manifest.json`, manifest(sealed), { mode: 0o600 });
      await box.pause();
      return sealed;
    } catch (error) {
      await box.terminate().catch(() => {});
      throw error;
    }
  }

  async pull(metadata) {
    const box = await this.#runningBox(metadata);
    return {
      ...metadata,
      state: "running",
      cpu: "running",
      resumedAt: new Date().toISOString(),
      camp: JSON.parse((await box.fs.read(`${metadata.rootPath}/CAMP.json`)).toString()),
      handoff: (await box.fs.read(`${metadata.rootPath}/HANDOFF.md`)).toString(),
    };
  }

  async storeAgentResult(metadata, result) {
    const box = await this.#runningBox(metadata);
    const relativePath = `agents/${result.id}.json`;
    await box.fs.write(`${metadata.rootPath}/${relativePath}`, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    return {
      ...metadata,
      state: "running",
      cpu: "running",
      files: [...new Set([...metadata.files, relativePath])],
    };
  }

  async terminate(metadata) {
    const box = await this.#box(metadata.sailboxId);
    await box.terminate();
    return {
      ...metadata,
      state: "terminated",
      cpu: "stopped",
      terminatedAt: new Date().toISOString(),
    };
  }
}

export function createWorkPodProvider(options = {}) {
  const requested = options.mode ?? process.env.RELAY_WORK_POD_PROVIDER ?? "auto";
  const mode = requested === "auto" ? (process.env.SAIL_API_KEY ? "sail" : "local") : requested;
  if (mode === "sail") return new SailWorkPodProvider(options.sail);
  if (mode === "local") return new LocalWorkPodProvider(options.podDir);
  throw new Error(`Unsupported work pod provider: ${mode}`);
}

export function createAgentResult({ harness, stdout, stderr, exitCode, durationMs }) {
  return {
    id: randomUUID(),
    harness,
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs,
    exitCode,
    stdout,
    stderr,
  };
}
