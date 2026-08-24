import assert from "node:assert/strict";
import test from "node:test";
import { deploySailHost } from "../src/sail-host.mjs";

test("deploys one Relay server behind Sail HTTP ingress", async () => {
  const calls = [];
  const box = {
    sailboxId: "sb_hosted",
    fs: { write: async (...args) => calls.push(["write", ...args]) },
    expose: async (port, options) => { calls.push(["expose", port, options]); return { endpoint: { kind: "http", url: "https://relay.sail.example/" } }; },
    exec: async (argv, options) => { calls.push(["exec", argv, options]); return {}; },
    waitForListener: async (port) => calls.push(["wait", port]),
  };
  const sdk = {
    Client: { fromEnv: () => ({}) },
    App: { find: async () => ({ id: "app_relay" }) },
    Image: { fromDockerfile: () => ({ image: true }) },
    Sailbox: { create: async () => box },
  };
  const result = await deploySailHost({ sdk, projectRoot: new URL("..", import.meta.url).pathname, providerKeys: false, hostToken: "host-control" });
  assert.equal(result.publicUrl, "https://relay.sail.example");
  assert.equal(result.sailboxId, "sb_hosted");
  assert.deepEqual(calls[0], ["expose", 4319, { protocol: "http" }]);
  const exec = calls.find(([name]) => name === "exec");
  assert.equal(exec[1], "node /opt/relay/bin/relay.mjs serve --host 0.0.0.0");
  assert.equal(exec[2].background, true);
  assert.equal(exec[2].env.RELAY_PUBLIC_URL, "https://relay.sail.example");
  assert.equal(exec[2].env.RELAY_HOSTED_ON_SAIL, "true");
  assert.equal(exec[2].env.RELAY_HOST_TOKEN, "host-control");
  assert.deepEqual(calls.at(-1), ["wait", 4319]);
});
