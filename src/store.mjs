import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileStore {
  constructor(root) {
    this.root = root;
    this.queue = Promise.resolve();
  }

  async init() {
    await mkdir(this.root, { recursive: true });
  }

  fileFor(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid relay id.");
    return path.join(this.root, `${id}.json`);
  }

  async create(record) {
    const target = this.fileFor(record.id);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    return record;
  }

  async get(id) {
    try {
      return JSON.parse(await readFile(this.fileFor(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async update(id, mutate) {
    const operation = this.queue.then(async () => {
      const record = await this.get(id);
      if (!record) return null;
      const updated = await mutate(record);
      const target = this.fileFor(id);
      const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, target);
      return updated;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
