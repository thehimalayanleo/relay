import { createServer as createHttpServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRecord, assertReadable, publicRecord } from "./protocol.mjs";
import { FileStore } from "./store.mjs";
import { renderPrompt, SUPPORTED_TARGETS } from "./adapters.mjs";
import { estimateCost } from "./cost.mjs";
import { createWorkPodProvider } from "./workpods.mjs";
import { ConfiguredAgentRunner } from "./agent-runner.mjs";
import { a2aErrorResponse, createA2aAgentCard, handleA2aJsonRpc } from "./a2a.mjs";
import { greptileHandoffCapsule } from "./greptile.mjs";
import { GreptileMcpClient } from "./greptile-mcp.mjs";
import { findingFromGreptileComment, improvementLoopDecision } from "./improvement-loop.mjs";
import { CollaborationHub } from "./collaboration.mjs";
import { ClaudeMemClient } from "./claude-mem.mjs";
import { AgentRunQueue } from "./agent-queue.mjs";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(sourceDir);
const publicRoot = path.join(projectRoot, "public");
const execFileAsync = promisify(execFile);

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/demo/greptile", ["greptile-demo.html", "text/html; charset=utf-8"]],
  ["/greptile-demo.js", ["greptile-demo.js", "text/javascript; charset=utf-8"]],
  ["/bug-ledger.json", ["bug-ledger.json", "application/json; charset=utf-8"]],
  ["/receiver", ["receiver.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/receiver.js", ["receiver.js", "text/javascript; charset=utf-8"]],
  ["/relay-button.js", ["relay-button.js", "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendError(response, error) {
  const statusByCode = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    EXPIRED: 410,
    INTEGRITY_FAILURE: 409,
    SECRET_DETECTED: 422,
    AGENT_NOT_CONFIGURED: 503,
    SAIL_NOT_CONFIGURED: 503,
    POD_UNAVAILABLE: 503,
    GREPTILE_NOT_CONFIGURED: 503,
    GREPTILE_UNAVAILABLE: 503,
    GREPTILE_MCP_ERROR: 502,
    GREPTILE_TOOL_ERROR: 502,
    CLAUDE_MEM_UNAVAILABLE: 503,
  };
  sendJson(response, statusByCode[error.code] ?? 400, {
    error: error.code ?? "BAD_REQUEST",
    message: error.message,
    ...(error.matches ? { matches: error.matches } : {}),
  });
}

async function readJson(request, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("Request body exceeds 1 MB.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requestToken(request, url) {
  const authorization = request.headers.authorization ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  return url.searchParams.get("token") ?? "";
}

function externalOrigin(request, url) {
  const protocol = request.headers["x-forwarded-proto"] ?? url.protocol.replace(":", "");
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  return `${protocol}://${host}`;
}

function isLoopback(request) {
  const address = request.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function receiptFrom(body, record, now = new Date()) {
  const actor = typeof body.actor === "string" ? body.actor.trim() : "recipient";
  const harness = typeof body.harness === "string" ? body.harness.trim() : "generic";
  const restatedGoal = typeof body.restatedGoal === "string" ? body.restatedGoal.trim() : "";
  const firstAction = typeof body.firstAction === "string" ? body.firstAction.trim() : "";
  const observedDigest = typeof body.observedDigest === "string" ? body.observedDigest.trim() : "";
  if (!restatedGoal || !firstAction) throw new Error("restatedGoal and firstAction are required.");
  if (observedDigest !== record.digest) {
    const error = new Error("Recipient digest does not match the sealed capsule.");
    error.code = "INTEGRITY_FAILURE";
    throw error;
  }
  return {
    acceptedAt: now.toISOString(),
    actor,
    harness,
    restatedGoal,
    firstAction,
    observedDigest,
  };
}

export async function createRelayServer(options = {}) {
  const store = options.store ?? new FileStore(
    options.dataDir ?? process.env.RELAY_DATA_DIR ?? path.join(projectRoot, ".data"),
  );
  await store.init();
  const workPodProvider = options.workPodProvider ?? createWorkPodProvider({
    mode: options.workPodMode,
    podDir: options.podDir ?? process.env.RELAY_POD_DIR ?? path.join(projectRoot, ".pods"),
    sail: options.sail,
  });
  await workPodProvider.init();
  const agentRunner = options.agentRunner ?? new ConfiguredAgentRunner();
  const greptileClient = options.greptileClient ?? new GreptileMcpClient();
  const corsOrigin = options.corsOrigin ?? process.env.RELAY_CORS_ORIGIN ?? "*";
  const collaboration = options.collaboration ?? new CollaborationHub();
  const claudeMem = options.claudeMem ?? new ClaudeMemClient();
  const agentQueue = options.agentQueue ?? new AgentRunQueue();

  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    response.setHeader("access-control-allow-origin", corsOrigin);
    response.setHeader("access-control-allow-headers", "content-type, authorization");
    response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (["GET", "HEAD"].includes(request.method) && staticFiles.has(url.pathname)) {
        const [file, contentType] = staticFiles.get(url.pathname);
        const body = await readFile(path.join(publicRoot, file));
        response.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          protocol: "relay/v1",
          workPod: workPodProvider.status(),
          autonomousAgent: agentRunner.status(),
          integrations: {
            greptile: {
              adapterSecretConfigured: Boolean(process.env.GREPTILE_RELAY_SECRET),
              apiKeyConfigured: Boolean(process.env.GREPTILE_API_KEY),
              liveApiConnected: false,
              transport: "finding-adapter",
            },
          },
        });
        return;
      }

      const roomMatch = url.pathname.match(/^\/v1\/rooms\/([a-z0-9_-]+)$/i);
      if (request.method === "GET" && roomMatch) {
        sendJson(response, 200, collaboration.snapshot(collaboration.room(roomMatch[1])));
        return;
      }

      const eventsMatch = url.pathname.match(/^\/v1\/rooms\/([a-z0-9_-]+)\/events$/i);
      if (request.method === "GET" && eventsMatch) {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        });
        const unsubscribe = collaboration.subscribe(eventsMatch[1], response);
        request.on("close", unsubscribe);
        return;
      }

      const joinMatch = url.pathname.match(/^\/v1\/rooms\/([a-z0-9_-]+)\/join$/i);
      if (request.method === "POST" && joinMatch) {
        sendJson(response, 200, collaboration.join(joinMatch[1], await readJson(request)));
        return;
      }

      const updateRoomMatch = url.pathname.match(/^\/v1\/rooms\/([a-z0-9_-]+)\/brief$/i);
      if (request.method === "POST" && updateRoomMatch) {
        sendJson(response, 200, collaboration.update(updateRoomMatch[1], await readJson(request)));
        return;
      }

      const activityMatch = url.pathname.match(/^\/v1\/rooms\/([a-z0-9_-]+)\/activity$/i);
      if (request.method === "POST" && activityMatch) {
        sendJson(response, 201, collaboration.addActivity(activityMatch[1], await readJson(request)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/demo/arc-run") {
        const runPath = process.env.RELAY_ARC_RUN_PATH
          ?? path.join(projectRoot, "arc-agi-3", "examples", "completed-episode.json");
        const run = JSON.parse(await readFile(runPath, "utf-8"));
        sendJson(response, 200, {
          ...run,
          claimBoundary: "ARC-AGI-3-compatible demonstration; not an official benchmark score.",
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/demo/arc-tests") {
        const arcRoot = process.env.RELAY_ARC_REPO
          ?? path.join(projectRoot, "arc-agi-3");
        const { stdout, stderr } = await execFileAsync("python3", ["tests/run_tests.py"], {
          cwd: arcRoot,
          timeout: 30_000,
          maxBuffer: 256_000,
        });
        const passed = [...stdout.matchAll(/^PASS /gm)].length;
        const failed = [...stdout.matchAll(/^FAIL /gm)].length;
        sendJson(response, failed ? 500 : 200, {
          status: failed ? "failed" : "passed",
          passed,
          failed,
          output: `${stdout}${stderr}`.trim(),
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/integrations/greptile/status") {
        const initialized = await greptileClient.initialize();
        sendJson(response, 200, {
          configured: greptileClient.configured(),
          liveApiConnected: initialized?.serverInfo?.name === "Greptile MCP Server",
          transport: "mcp",
          server: initialized?.serverInfo ?? null,
          protocolVersion: initialized?.protocolVersion ?? null,
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/integrations/claude-mem/status") {
        sendJson(response, 200, await claudeMem.status());
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/integrations/claude-mem/search") {
        const body = await readJson(request);
        const query = typeof body.query === "string" ? body.query.trim() : "";
        if (!query) throw new Error("query is required.");
        sendJson(response, 200, await claudeMem.search({
          query,
          project: typeof body.project === "string" ? body.project.trim() : "",
          limit: Number(body.limit ?? 8),
        }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/integrations/greptile/pull-requests") {
        const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
        const result = await greptileClient.listOpenPullRequests(limit);
        sendJson(response, 200, { liveApiConnected: true, transport: "mcp", result });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/integrations/greptile/comments") {
        const body = await readJson(request);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const prNumber = Number(body.prNumber);
        if (!name || !Number.isInteger(prNumber) || prNumber <= 0) {
          throw new Error("name and a positive integer prNumber are required.");
        }
        const result = await greptileClient.listGreptileComments({
          name,
          prNumber,
          remote: body.remote,
          defaultBranch: body.defaultBranch,
        });
        sendJson(response, 200, { liveApiConnected: true, transport: "mcp", result });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/integrations/greptile/improve") {
        const body = await readJson(request);
        const context = {
          name: typeof body.name === "string" ? body.name.trim() : "",
          remote: body.remote ?? "github",
          defaultBranch: body.defaultBranch ?? "main",
          branch: typeof body.branch === "string" ? body.branch.trim() : "",
          prNumber: Number(body.prNumber),
        };
        if (!context.name || !Number.isInteger(context.prNumber) || context.prNumber <= 0) {
          throw new Error("name and a positive integer prNumber are required.");
        }
        if (body.triggerReview === true) {
          const review = await greptileClient.triggerCodeReview(context);
          sendJson(response, 202, {
            status: "review-triggered",
            transport: "mcp",
            next: "Call this endpoint again without triggerReview after Greptile completes the review.",
            review,
          });
          return;
        }

        const commentResult = await greptileClient.listGreptileComments(context);
        const decision = improvementLoopDecision({
          comments: commentResult,
          iteration: body.iteration,
          maxIterations: body.maxIterations,
        });
        if (decision.status !== "action-required") {
          sendJson(response, 200, { ...decision, transport: "mcp", repository: context.name, prNumber: context.prNumber });
          return;
        }

        const finding = findingFromGreptileComment(decision.comment, context);
        const capsule = greptileHandoffCapsule({
          finding,
          goal: `Resolve Greptile feedback on ${context.name} PR #${context.prNumber}.`,
          investigation: {
            constraints: [
              `Recursive improvement iteration ${decision.iteration} of ${decision.maxIterations}.`,
              "Stop when Greptile has no unresolved comments or the iteration budget is exhausted.",
            ],
            nextAction: "Reproduce or validate the finding before editing, then implement the smallest safe patch.",
          },
          acceptanceCriteria: [
            "Relevant tests pass",
            "Greptile re-review reports this comment addressed",
            "No new higher-severity Greptile finding is introduced",
          ],
        }, { trustedAdapter: true });
        const { record, token } = createRecord(capsule, { ttlHours: 24 });
        record.workPod = await workPodProvider.create({
          id: record.id,
          capsule: record.capsule,
          digest: record.digest,
        });
        try {
          await store.create(record);
        } catch (error) {
          await workPodProvider.terminate(record.workPod).catch(() => {});
          throw error;
        }
        const origin = externalOrigin(request, url);
        sendJson(response, 201, {
          status: "handoff-created",
          loop: {
            iteration: decision.iteration,
            maxIterations: decision.maxIterations,
            remainingFindings: decision.remainingFindings,
          },
          id: record.id,
          digest: record.digest,
          shareUrl: `${origin}/receiver#id=${encodeURIComponent(record.id)}&token=${encodeURIComponent(token)}`,
          workPod: record.workPod,
          transport: "mcp",
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/integrations/greptile/handoffs") {
        const configuredSecret = process.env.GREPTILE_RELAY_SECRET ?? "";
        const suppliedSecret = request.headers["x-relay-integration-secret"] ?? "";
        const authenticated = Boolean(configuredSecret) && suppliedSecret === configuredSecret;
        if (!authenticated && !isLoopback(request)) {
          const error = new Error("Greptile adapter requires a valid integration secret.");
          error.code = "FORBIDDEN";
          throw error;
        }
        const body = await readJson(request);
        const capsule = greptileHandoffCapsule(body, { trustedAdapter: authenticated });
        const ttlHours = Number(body.ttlHours ?? 24);
        if (!(ttlHours > 0 && ttlHours <= 168)) throw new Error("ttlHours must be between 0 and 168.");
        const { record, token } = createRecord(capsule, { ttlHours });
        record.workPod = await workPodProvider.create({
          id: record.id,
          capsule: record.capsule,
          digest: record.digest,
        });
        try {
          await store.create(record);
        } catch (error) {
          await workPodProvider.terminate(record.workPod).catch(() => {});
          throw error;
        }
        const origin = externalOrigin(request, url);
        sendJson(response, 201, {
          id: record.id,
          digest: record.digest,
          expiresAt: record.expiresAt,
          token,
          shareUrl: `${origin}/receiver#id=${encodeURIComponent(record.id)}&token=${encodeURIComponent(token)}`,
          workPod: record.workPod,
          integration: {
            source: "greptile",
            mode: authenticated ? "trusted-adapter-input" : "local-demo",
            liveApiConnected: false,
            memories: record.capsule.memories.length,
          },
        });
        return;
      }

      if (["GET", "HEAD"].includes(request.method) && url.pathname === "/.well-known/agent-card.json") {
        const card = createA2aAgentCard(externalOrigin(request, url));
        const body = `${JSON.stringify(card)}\n`;
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300",
          etag: `W/\"relay-a2a-${card.version}\"`,
        });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }

      if (request.method === "POST" && url.pathname === "/a2a") {
        let body;
        try {
          body = await readJson(request);
        } catch {
          sendJson(response, 200, a2aErrorResponse(null, -32700, "Invalid JSON payload", {
            reason: "JSON_PARSE_ERROR",
          }));
          return;
        }
        const version = request.headers["a2a-version"] ?? url.searchParams.get("A2A-Version") ?? "0.3";
        sendJson(response, 200, await handleA2aJsonRpc(body, {
          store,
          workPodProvider,
          agentRunner,
          agentQueue,
        }, { version }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/relays") {
        const body = await readJson(request);
        const ttlHours = Number(body.ttlHours ?? 72);
        if (!(ttlHours > 0 && ttlHours <= 168)) throw new Error("ttlHours must be between 0 and 168.");
        const { record, token } = createRecord(body.capsule ?? body, { ttlHours });
        if (body.workPod?.requested) {
          record.workPod = await workPodProvider.create({
            id: record.id,
            capsule: record.capsule,
            digest: record.digest,
          });
        }
        try {
          await store.create(record);
        } catch (error) {
          if (record.workPod) await workPodProvider.terminate(record.workPod).catch(() => {});
          throw error;
        }
        const origin = externalOrigin(request, url);
        const shareUrl = `${origin}/receiver#id=${encodeURIComponent(record.id)}&token=${encodeURIComponent(token)}`;
        sendJson(response, 201, {
          id: record.id,
          digest: record.digest,
          expiresAt: record.expiresAt,
          token,
          shareUrl,
          ...(record.workPod ? { workPod: record.workPod } : {}),
        });
        return;
      }

      const podMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})\/pod$/i);
      if (request.method === "GET" && podMatch) {
        const record = assertReadable(await store.get(podMatch[1]), requestToken(request, url));
        if (!record.workPod) {
          const error = new Error("This relay has no work pod.");
          error.code = "NOT_FOUND";
          throw error;
        }
        const pulled = await workPodProvider.pull(record.workPod);
        const { camp, handoff, ...metadata } = pulled;
        await store.update(record.id, (current) => ({ ...current, workPod: metadata }));
        sendJson(response, 200, { ...metadata, camp, handoff });
        return;
      }

      const terminatePodMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})\/pod\/terminate$/i);
      if (request.method === "POST" && terminatePodMatch) {
        const token = requestToken(request, url);
        let terminated;
        const updated = await store.update(terminatePodMatch[1], async (record) => {
          assertReadable(record, token);
          if (!record.workPod) {
            const error = new Error("This relay has no work pod.");
            error.code = "NOT_FOUND";
            throw error;
          }
          terminated = await workPodProvider.terminate(record.workPod);
          return { ...record, workPod: terminated };
        });
        if (!updated) {
          const error = new Error("Relay not found.");
          error.code = "NOT_FOUND";
          throw error;
        }
        sendJson(response, 200, { workPod: terminated });
        return;
      }

      const agentRunMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})\/agent\/run$/i);
      if (request.method === "POST" && agentRunMatch) {
        const token = requestToken(request, url);
        const body = await readJson(request);
        const record = assertReadable(await store.get(agentRunMatch[1]), token);
        if (!record.workPod) {
          const error = new Error("Autonomous continuation requires a work pod.");
          error.code = "NOT_FOUND";
          throw error;
        }
        const target = typeof body.target === "string" ? body.target : "generic";
        if (!SUPPORTED_TARGETS.includes(target)) throw new Error(`Unsupported target: ${target}`);
        const rendered = renderPrompt(record, target);
        const prompt = body.demo === true
          ? `${rendered}\n\nStage demonstration: do not inspect files or use tools. In no more than three short sentences, state the problem, the constraint, and the next action you inherited.`
          : rendered;
        const output = await agentQueue.enqueue(record.id, {
          target,
          requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : "http-api",
        }, async (queueJob) => {
          const result = await agentRunner.run(prompt);
          const workPod = await workPodProvider.storeAgentResult(record.workPod, result);
          const runSummary = {
            id: result.id,
            harness: result.harness,
            completedAt: result.completedAt,
            exitCode: result.exitCode,
            artifact: `agents/${result.id}.json`,
            queueJobId: queueJob.id,
          };
          await store.update(record.id, (current) => ({
            ...current,
            status: result.exitCode === 0 ? "agent-completed" : "agent-failed",
            workPod,
            agentRuns: [...(current.agentRuns ?? []), runSummary],
          }));
          return { status: result.exitCode === 0 ? "agent-completed" : "agent-failed", result, workPod, queueJob };
        });
        sendJson(response, 201, { ...output, queue: agentQueue.status(record.id) });
        return;
      }

      const agentQueueMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})\/agent\/queue$/i);
      if (request.method === "GET" && agentQueueMatch) {
        assertReadable(await store.get(agentQueueMatch[1]), requestToken(request, url));
        sendJson(response, 200, agentQueue.status(agentQueueMatch[1]));
        return;
      }

      const relayMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})$/i);
      if (request.method === "GET" && relayMatch) {
        const record = assertReadable(await store.get(relayMatch[1]), requestToken(request, url));
        sendJson(response, 200, publicRecord(record));
        return;
      }

      const renderMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})\/render$/i);
      if (request.method === "GET" && renderMatch) {
        const record = assertReadable(await store.get(renderMatch[1]), requestToken(request, url));
        const target = url.searchParams.get("target") ?? "generic";
        if (!SUPPORTED_TARGETS.includes(target)) throw new Error(`Unsupported target: ${target}`);
        response.writeHead(200, {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(renderPrompt(record, target));
        return;
      }

      const acceptMatch = url.pathname.match(/^\/v1\/relays\/([0-9a-f-]{36})\/accept$/i);
      if (request.method === "POST" && acceptMatch) {
        const token = requestToken(request, url);
        const body = await readJson(request);
        let receipt;
        const updated = await store.update(acceptMatch[1], (record) => {
          assertReadable(record, token);
          receipt = receiptFrom(body, record);
          return { ...record, status: "accepted", receipts: [...record.receipts, receipt] };
        });
        if (!updated) {
          const error = new Error("Relay not found.");
          error.code = "NOT_FOUND";
          throw error;
        }
        sendJson(response, 201, { status: updated.status, receipt });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/cost-estimate") {
        sendJson(response, 200, estimateCost(await readJson(request)));
        return;
      }

      sendJson(response, 404, { error: "NOT_FOUND", message: "Route not found." });
    } catch (error) {
      sendError(response, error);
    }
  });
}

async function main() {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 4317);
  const server = await createRelayServer();
  server.listen(port, host, () => {
    console.log(`Relay listening at http://${host}:${port}`);
    if (host === "0.0.0.0") console.log("Warning: auth is not implemented. Put Relay behind a trusted gateway.");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
