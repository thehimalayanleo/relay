import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { SailWorkPodProvider } from "../src/workpods.mjs";

const capsule = {
  title: "Sail transfer",
  goal: "Continue on another operator.",
  state: { completed: ["Captured state"] },
  nextAction: "Verify the bundle.",
};

function fakeSailSdk() {
  const files = new Map();
  const client = { kind: "fake-client" };
  const app = { id: "app_test", name: "relay-test" };
  const box = {
    sailboxId: "sb_test",
    status: "running",
    fs: {
      write: async (target, value) => files.set(target, Buffer.from(value)),
      read: async (target) => {
        if (!files.has(target)) throw new Error(`Missing fake file ${target}`);
        return files.get(target);
      },
    },
    pause: async () => { box.status = "paused"; },
    resume: async () => { box.status = "running"; },
    terminate: async () => { box.status = "terminated"; },
  };
  return {
    client,
    box,
    files,
    sdk: {
      Client: { fromEnv: () => client },
      App: {
        find: async (name, options) => {
          assert.equal(name, "relay-test");
          assert.equal(options.client, client);
          return app;
        },
      },
      Sailbox: {
        create: async (options) => {
          assert.equal(options.client, client);
          assert.equal(options.private, true);
          return box;
        },
        get: async (id, options) => {
          assert.equal(id, box.sailboxId);
          assert.equal(options.client, client);
          return box;
        },
      },
    },
  };
}

test("Sail provider writes, pauses, resumes, records agent output, and terminates", async () => {
  const fake = fakeSailSdk();
  const provider = new SailWorkPodProvider({
    appName: "relay-test",
    client: fake.client,
    sdkLoader: async () => fake.sdk,
  });
  await provider.init();
  const id = randomUUID();
  const metadata = await provider.create({ id, capsule, digest: "sha256:test" });
  assert.equal(metadata.provider, "sail");
  assert.equal(metadata.sailboxId, "sb_test");
  assert.equal(metadata.state, "paused");
  assert.equal(fake.box.status, "paused");
  assert.equal(JSON.stringify(metadata).includes("api"), false);

  const pulled = await provider.pull(metadata);
  assert.equal(fake.box.status, "running");
  assert.equal(pulled.camp.digest, "sha256:test");
  assert.match(pulled.handoff, /Sail transfer/);

  const updated = await provider.storeAgentResult(metadata, { id: "run-1", stdout: "ok" });
  assert.match(updated.files.at(-1), /^agents\//);
  assert.ok(fake.files.has(`${metadata.rootPath}/agents/run-1.json`));

  const terminated = await provider.terminate(updated);
  assert.equal(terminated.state, "terminated");
  assert.equal(fake.box.status, "terminated");
});
