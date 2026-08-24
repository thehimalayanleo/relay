import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function hostToken() {
  return randomBytes(32).toString("base64url");
}

async function optionalOpenCodeAuth(authPath) {
  try { return await readFile(authPath, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}

export async function deploySailHost(options = {}) {
  const sdk = options.sdk ?? await import("@sailresearch/sdk");
  const client = options.client ?? sdk.Client.fromEnv();
  const appName = options.appName ?? process.env.SAIL_APP_NAME ?? "relay";
  const port = Number(options.port ?? 4319);
  const projectRoot = options.projectRoot ?? path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(projectRoot, "..");
  const token = options.hostToken ?? hostToken();
  const app = await sdk.App.find(appName, { mintIfMissing: true, client });
  const image = options.image ?? sdk.Image.fromDockerfile(path.join(root, "Dockerfile.sail"), {
    contextDir: root,
    ignore: [".git/", "node_modules/", ".data/", ".pods/", "arc-agi-3/tools/"],
  });
  const box = await sdk.Sailbox.create({
    app,
    client,
    image,
    name: options.name || `relay-host-${Date.now()}`,
    private: true,
    timeoutSeconds: Number(options.timeoutSeconds ?? 900),
  });
  try {
    const exposed = await box.expose(port, { protocol: "http" });
    if (exposed.endpoint?.kind !== "http") throw new Error("Sail did not return an HTTP ingress endpoint.");
    const publicUrl = exposed.endpoint.url.replace(/\/$/, "");
    const authPath = options.openCodeAuthPath ?? path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
    const providerKeys = options.providerKeys === true;
    const openCodeAuth = providerKeys && options.openCodeAuth !== false ? await optionalOpenCodeAuth(authPath) : "";
    if (openCodeAuth) await box.fs.write("/root/.local/share/opencode/auth.json", openCodeAuth, { mode: 0o600, createParents: true, user: "0:0" });
    const env = {
    HOST: "0.0.0.0",
    PORT: String(port),
    RELAY_PUBLIC_URL: publicUrl,
    RELAY_HOST_TOKEN: token,
    RELAY_DATA_DIR: "/data",
    RELAY_POD_DIR: "/data/pods",
    RELAY_WORK_POD_PROVIDER: "local",
    RELAY_HOSTED_ON_SAIL: "true",
    RELAY_OPENCODE_MODEL: options.fastModel ?? process.env.RELAY_OPENCODE_MODEL ?? "opencode-go/gpt-5.6-luna",
    RELAY_STRONG_MODEL: options.strongModel ?? process.env.RELAY_STRONG_MODEL ?? "opencode-go/deepseek-v4-pro",
    RELAY_ESCALATION_STEP_BUDGET: String(options.escalationStepBudget ?? 10),
    ...(providerKeys && process.env.GREPTILE_API_KEY ? { GREPTILE_API_KEY: process.env.GREPTILE_API_KEY } : {}),
    ...(openCodeAuth ? { RELAY_AGENT_HARNESS: "opencode-go", RELAY_AGENT_ARGV: '["relay-opencode-runner"]' } : {}),
    };
    await box.exec("node /opt/relay/bin/relay.mjs serve --host 0.0.0.0", { env, background: true });
    await box.waitForListener(port, { timeoutSeconds: Number(options.listenerTimeoutSeconds ?? 120) });
    return { box, sailboxId: box.sailboxId, appName, publicUrl, hostToken: token, openCodeConfigured: Boolean(openCodeAuth) };
  } catch (error) {
    await box.terminate().catch(() => {});
    throw error;
  }
}

export async function createHostedSession(deployment, input) {
  const response = await fetch(`${deployment.publicUrl}/v1/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${deployment.hostToken}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `Hosted Relay returned HTTP ${response.status}.`);
  return body;
}
