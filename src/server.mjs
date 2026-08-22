import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRecord, assertReadable, publicRecord } from "./protocol.mjs";
import { FileStore } from "./store.mjs";
import { renderPrompt, SUPPORTED_TARGETS } from "./adapters.mjs";
import { estimateCost } from "./cost.mjs";
import { LocalWorkPodProvider } from "./workpods.mjs";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(sourceDir);
const publicRoot = path.join(projectRoot, "public");

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/receiver", ["receiver.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/receiver.js", ["receiver.js", "text/javascript; charset=utf-8"]],
  ["/passon-button.js", ["passon-button.js", "text/javascript; charset=utf-8"]],
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

export async function createPassOnServer(options = {}) {
  const store = options.store ?? new FileStore(
    options.dataDir ?? process.env.PASS_ON_DATA_DIR ?? path.join(projectRoot, ".data"),
  );
  await store.init();
  const workPodProvider = options.workPodProvider ?? new LocalWorkPodProvider(
    options.podDir ?? process.env.PASS_ON_POD_DIR ?? path.join(projectRoot, ".pods"),
  );
  await workPodProvider.init();
  const corsOrigin = options.corsOrigin ?? process.env.PASS_ON_CORS_ORIGIN ?? "*";

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
        sendJson(response, 200, { ok: true, protocol: "passon/v1" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/passons") {
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
        await store.create(record);
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

      const podMatch = url.pathname.match(/^\/v1\/passons\/([0-9a-f-]{36})\/pod$/i);
      if (request.method === "GET" && podMatch) {
        const record = assertReadable(await store.get(podMatch[1]), requestToken(request, url));
        if (!record.workPod) {
          const error = new Error("This pass-on has no work pod.");
          error.code = "NOT_FOUND";
          throw error;
        }
        sendJson(response, 200, await workPodProvider.pull(record.workPod));
        return;
      }

      const passonMatch = url.pathname.match(/^\/v1\/passons\/([0-9a-f-]{36})$/i);
      if (request.method === "GET" && passonMatch) {
        const record = assertReadable(await store.get(passonMatch[1]), requestToken(request, url));
        sendJson(response, 200, publicRecord(record));
        return;
      }

      const renderMatch = url.pathname.match(/^\/v1\/passons\/([0-9a-f-]{36})\/render$/i);
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

      const acceptMatch = url.pathname.match(/^\/v1\/passons\/([0-9a-f-]{36})\/accept$/i);
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
          const error = new Error("Pass-on not found.");
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
  const server = await createPassOnServer();
  server.listen(port, host, () => {
    console.log(`PassOn listening at http://${host}:${port}`);
    if (host === "0.0.0.0") console.log("Warning: auth is not implemented. Put PassOn behind a trusted gateway.");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
