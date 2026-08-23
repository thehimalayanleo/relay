#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function usage() {
  console.log(`Relay CLI

Portable human-agent handoffs for shells and agent harnesses.

Usage:
  relay serve [--host HOST] [--port PORT] [--public-url URL]
  relay configure
  relay session create --title TEXT --repo OWNER/REPO --pr NUMBER [--server URL]
  relay doctor [--server URL]
  relay handoff [notes.txt|-] --goal TEXT --next TEXT [--to TARGET] [--from HARNESS] [--pod] [--quiet]
  relay create <capsule.json> [--pod] [--ttl HOURS] [--quiet] [--server URL]
  relay pull <share-url> [--target codex|claude|cursor|opencode|generic|human]
  relay get <share-url>
  relay pod <share-url>
  relay agent <share-url> [--target codex|claude|cursor|opencode|generic|human]
  relay agent-queue <share-url>
  relay terminate <share-url>
  relay render <share-url> [--target codex|claude|cursor|opencode|generic|human]
  relay accept <share-url> --actor NAME --goal TEXT --first-action TEXT [--harness NAME]
  relay cost [assumptions.json] [--server URL]

Agent-friendly examples:
  git diff | relay handoff - --goal "Finish the parser fix" --next "Run npm test" --to codex --pod --quiet
  relay pull "$RELAY_URL" --target claude

All structured commands write JSON to stdout. Errors go to stderr and use a nonzero exit code.
`);
}

const configPath = process.env.RELAY_CONFIG_PATH
  ?? path.join(os.homedir(), ".config", "relay", "config.json");

async function loadSavedConfig() {
  try {
    const saved = JSON.parse(await readFile(configPath, "utf8"));
    for (const name of ["SAIL_API_KEY", "GREPTILE_API_KEY", "RELAY_AGENT_HARNESS", "RELAY_AGENT_ARGV"]) {
      if (!process.env[name] && typeof saved[name] === "string" && saved[name]) process.env[name] = saved[name];
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function promptSecret(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("configure requires an interactive terminal.");
  return new Promise((resolve, reject) => {
    let value = "";
    const stdin = process.stdin;
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup();
          reject(new Error("Configuration cancelled."));
          return;
        }
        if (byte === 13 || byte === 10) {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (byte === 127 || byte === 8) value = value.slice(0, -1);
        else value += String.fromCharCode(byte);
      }
    };
    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function configure() {
  console.log("Relay stores keys locally with mode 0600. Press Enter to leave an integration disabled.");
  const sail = process.env.SAIL_API_KEY ?? await promptSecret("Sail API key: ");
  const greptile = process.env.GREPTILE_API_KEY ?? await promptSecret("Greptile API key: ");
  const config = {};
  if (sail) config.SAIL_API_KEY = sail;
  if (greptile) config.GREPTILE_API_KEY = greptile;
  if (process.env.RELAY_AGENT_HARNESS) config.RELAY_AGENT_HARNESS = process.env.RELAY_AGENT_HARNESS;
  if (process.env.RELAY_AGENT_ARGV) config.RELAY_AGENT_ARGV = process.env.RELAY_AGENT_ARGV;
  await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(configPath, 0o600);
  console.log(`Saved ${Object.keys(config).length} integration key(s) to ${configPath}.`);
  console.log("Claude-Mem is detected from the host worker. Model execution uses the host's RELAY_AGENT_ARGV configuration.");
}

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function positional(index = 0) {
  const values = process.argv.slice(3).filter((value, offset, all) => {
    if (value.startsWith("--")) return false;
    return offset === 0 || !all[offset - 1].startsWith("--");
  });
  return values[index];
}

function endpointFromShareUrl(shareUrl, suffix = "") {
  if (!shareUrl) throw new Error("Provide a Relay link.");
  const parsed = new URL(shareUrl);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const id = parsed.searchParams.get("id") ?? fragment.get("id");
  const token = parsed.searchParams.get("token") ?? fragment.get("token");
  if (!id || !token) throw new Error("Share URL must include id and token.");
  return { origin: parsed.origin, id, url: `${parsed.origin}/v1/relays/${id}${suffix}`, token };
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
  return body;
}

function authorized(endpoint) {
  return { headers: { authorization: `Bearer ${endpoint.token}` } };
}

function writeJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function readTextInput(path) {
  if (!path || path === "-") return readFile(0, "utf8");
  return readFile(path, "utf8");
}

function capsuleFromNotes(notes) {
  const cleaned = notes.trim();
  if (!cleaned) throw new Error("Handoff notes cannot be empty.");
  const title = option("--title", cleaned.split("\n")[0].slice(0, 72));
  const goal = option("--goal");
  const nextAction = option("--next");
  if (!goal) throw new Error("--goal is required for a notes handoff.");
  if (!nextAction) throw new Error("--next is required for a notes handoff.");
  return {
    title,
    goal,
    acceptanceCriteria: ["Restate the objective, boundary, and first action before proceeding"],
    state: { partial: ["Transferred context has not been independently verified by the recipient"] },
    constraints: ["Verify supplied context against available artifacts before editing"],
    traceSummary: cleaned,
    nextAction,
    stopConditions: ["Stop if the handoff contradicts the current workspace or contains unintended secrets"],
    source: {
      harness: option("--from", "relay-cli"),
      actor: option("--actor", "local-user"),
      taskId: option("--task", ""),
    },
    intendedRecipient: option("--to", "generic"),
  };
}

async function create(server, capsule) {
  const ttlHours = Number(option("--ttl", "72"));
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) throw new Error("--ttl must be a positive number.");
  return jsonRequest(`${server}/v1/relays`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capsule, ttlHours, workPod: { requested: flag("--pod") } }),
  });
}

async function main() {
  const command = process.argv[2];
  const argument = positional(0);
  const server = option("--server", process.env.RELAY_SERVER ?? "http://127.0.0.1:4317").replace(/\/$/, "");

  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "serve") {
    await loadSavedConfig();
    const { createRelayServer } = await import("../src/server.mjs");
    const host = option("--host", process.env.HOST ?? "127.0.0.1");
    const port = Number(option("--port", process.env.PORT ?? "4317"));
    const publicUrl = option("--public-url", process.env.RELAY_PUBLIC_URL ?? "").replace(/\/$/, "");
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be an integer from 1 to 65535.");
    if (publicUrl) new URL(publicUrl);
    process.env.RELAY_PUBLIC_URL = publicUrl;
    const service = await createRelayServer({ publicUrl });
    await new Promise((resolve, reject) => {
      service.once("error", reject);
      service.listen(port, host, resolve);
    });
    console.log(`Relay listening at http://${host}:${port}`);
    console.log(`Host dashboard: http://127.0.0.1:${port}/demo/greptile`);
    if (publicUrl) console.log(`Collaborator base URL: ${publicUrl}/demo/greptile`);
    else if (["0.0.0.0", "::"].includes(host)) {
      console.warn("Warning: Relay is reachable beyond localhost but --public-url was not provided.");
      console.warn(`Restart with: relay serve --host ${host} --public-url http://<tailscale-name>:${port}`);
      console.warn("Relay will not advertise localhost as a collaborator URL when a public URL is configured.");
    }
    return;
  }

  if (command === "configure") {
    await configure();
    return;
  }

  if (command === "session" && process.argv[3] === "create") {
    const title = option("--title");
    const repo = option("--repo");
    const prNumber = Number(option("--pr"));
    if (!title) throw new Error("session create requires --title.");
    if (!repo || !repo.includes("/")) throw new Error("session create requires --repo OWNER/REPO.");
    if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error("session create requires a positive --pr number.");
    const created = await jsonRequest(`${server}/v1/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, creatorRole: "swe", repository: { name: repo, prNumber, remote: "github", defaultBranch: option("--default-branch", "main") } }),
    });
    console.log("Relay session ready");
    console.log(`Host:   ${created.hostWorkspaceUrl ?? created.creatorUrl}`);
    console.log(`Invite: ${created.pmInviteUrl}`);
    console.log(`Expires: ${created.expiresAt}`);
    return;
  }

  if (command === "doctor") {
    const health = await jsonRequest(`${server}/health`);
    writeJson({ ok: true, server, ...health, next: "relay handoff - --goal <goal> --next <action> --pod" });
    return;
  }

  if (command === "handoff") {
    const created = await create(server, capsuleFromNotes(await readTextInput(argument)));
    if (flag("--quiet")) console.log(created.shareUrl);
    else writeJson(created);
    return;
  }

  if (command === "create") {
    if (!argument) throw new Error("Provide a capsule JSON file.");
    const created = await create(server, JSON.parse(await readFile(argument, "utf8")));
    if (flag("--quiet")) console.log(created.shareUrl);
    else writeJson(created);
    return;
  }

  if (command === "get") {
    const endpoint = endpointFromShareUrl(argument);
    writeJson(await jsonRequest(endpoint.url, authorized(endpoint)));
    return;
  }

  if (command === "pod") {
    const endpoint = endpointFromShareUrl(argument, "/pod");
    writeJson(await jsonRequest(endpoint.url, authorized(endpoint)));
    return;
  }

  if (command === "agent") {
    const endpoint = endpointFromShareUrl(argument, "/agent/run");
    writeJson(await jsonRequest(endpoint.url, {
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify({ target: option("--target", "generic") }),
    }));
    return;
  }

  if (command === "agent-queue") {
    const endpoint = endpointFromShareUrl(argument, "/agent/queue");
    writeJson(await jsonRequest(endpoint.url, authorized(endpoint)));
    return;
  }

  if (command === "terminate") {
    const endpoint = endpointFromShareUrl(argument, "/pod/terminate");
    writeJson(await jsonRequest(endpoint.url, {
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}` },
    }));
    return;
  }

  if (command === "render") {
    const endpoint = endpointFromShareUrl(argument, "/render");
    const target = option("--target", "generic");
    const response = await fetch(`${endpoint.url}?target=${encodeURIComponent(target)}`, authorized(endpoint));
    if (!response.ok) throw new Error((await response.json()).message ?? `HTTP ${response.status}`);
    console.log(await response.text());
    return;
  }

  if (command === "pull") {
    const endpoint = endpointFromShareUrl(argument);
    const target = option("--target", "generic");
    const [record, resumePrompt, pod] = await Promise.all([
      jsonRequest(endpoint.url, authorized(endpoint)),
      fetch(`${endpoint.url}/render?target=${encodeURIComponent(target)}`, authorized(endpoint)).then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).message ?? `HTTP ${response.status}`);
        return response.text();
      }),
      jsonRequest(`${endpoint.url}/pod`, authorized(endpoint)).catch((error) => ({ unavailable: true, reason: error.message })),
    ]);
    writeJson({ record, resumePrompt, workPod: pod });
    return;
  }

  if (command === "accept") {
    const endpoint = endpointFromShareUrl(argument, "/accept");
    const record = await jsonRequest(endpoint.url.replace(/\/accept$/, ""), authorized(endpoint));
    const receipt = {
      actor: option("--actor", "recipient"),
      harness: option("--harness", "generic"),
      restatedGoal: option("--goal"),
      firstAction: option("--first-action"),
      observedDigest: record.digest,
    };
    if (!receipt.restatedGoal || !receipt.firstAction) throw new Error("accept requires --goal and --first-action.");
    writeJson(await jsonRequest(endpoint.url, {
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify(receipt),
    }));
    return;
  }

  if (command === "cost") {
    const assumptions = argument ? JSON.parse(await readFile(argument, "utf8")) : {};
    writeJson(await jsonRequest(`${server}/v1/cost-estimate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(assumptions),
    }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`relay: ${error.message}`);
  process.exitCode = 1;
});
