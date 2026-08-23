#!/usr/bin/env node
import { readFile } from "node:fs/promises";

function usage() {
  console.log(`Relay CLI

Portable human-agent handoffs for shells and agent harnesses.

Usage:
  relay serve [--host HOST] [--port PORT]
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
    const { createRelayServer } = await import("../src/server.mjs");
    const host = option("--host", process.env.HOST ?? "127.0.0.1");
    const port = Number(option("--port", process.env.PORT ?? "4317"));
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be an integer from 1 to 65535.");
    const service = await createRelayServer();
    await new Promise((resolve, reject) => {
      service.once("error", reject);
      service.listen(port, host, resolve);
    });
    console.log(`Relay listening at http://${host}:${port}`);
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
