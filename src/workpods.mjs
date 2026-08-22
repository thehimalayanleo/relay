import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function assertPodId(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid work pod id.");
}

function handoffMarkdown(capsule, digest) {
  const completed = capsule.state.completed.length
    ? capsule.state.completed.map((item) => `- ${item}`).join("\n")
    : "- None recorded";
  return `# ${capsule.title}\n\nDigest: ${digest}\n\n## Objective\n\n${capsule.goal}\n\n## Completed\n\n${completed}\n\n## Next safe action\n\n${capsule.nextAction}\n`;
}

export class LocalWorkPodProvider {
  constructor(root) {
    this.root = root;
  }

  async init() {
    await mkdir(this.root, { recursive: true });
  }

  async create({ id, capsule, digest }) {
    assertPodId(id);
    const podRoot = path.join(this.root, id);
    await mkdir(podRoot, { recursive: false, mode: 0o700 });
    const campBundle = {
      schemaVersion: "camp/0.1",
      digest,
      capsule,
    };
    const files = ["CAMP.json", "HANDOFF.md", "manifest.json"];
    const metadata = {
      provider: "local-demo",
      id,
      state: "ready",
      cpu: "on-demand",
      createdAt: new Date().toISOString(),
      files,
    };
    await writeFile(path.join(podRoot, "CAMP.json"), `${JSON.stringify(campBundle, null, 2)}\n`, { mode: 0o600 });
    await writeFile(path.join(podRoot, "HANDOFF.md"), handoffMarkdown(capsule, digest), { mode: 0o600 });
    await writeFile(path.join(podRoot, "manifest.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
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
}
