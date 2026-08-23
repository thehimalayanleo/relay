import { randomUUID } from "node:crypto";
import { renderPrompt, SUPPORTED_TARGETS } from "./adapters.mjs";
import { assertReadable, publicRecord } from "./protocol.mjs";

export const A2A_PROTOCOL_VERSION = "1.0";

class A2aError extends Error {
  constructor(code, message, reason, field) {
    super(message);
    this.code = code;
    this.reason = reason;
    this.field = field;
  }
}

function errorData(error) {
  if (error.code === -32602 && error.field) {
    return [{
      "@type": "type.googleapis.com/google.rpc.BadRequest",
      fieldViolations: [{ field: error.field, description: error.message }],
    }];
  }
  return [{
    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
    reason: error.reason ?? "A2A_REQUEST_FAILED",
    domain: "passon.local",
  }];
}

export function a2aErrorResponse(id, code, message, options = {}) {
  const error = new A2aError(code, message, options.reason, options.field);
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, data: errorData(error) },
  };
}

function invalidParams(message, field) {
  throw new A2aError(-32602, message, "INVALID_PARAMS", field);
}

function candidateUrls(text) {
  if (typeof text !== "string") return [];
  return text
    .match(/https?:\/\/[^\s<>"']+/g)
    ?.map((value) => value.replace(/[),.;!?]+$/, "")) ?? [];
}

function dataCapability(data) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  return data.passonCapabilityUrl
    ?? data.shareUrl
    ?? data.passon?.shareUrl
    ?? data.passon?.capabilityUrl
    ?? "";
}

function requestOptions(parts) {
  for (const part of parts) {
    if (!part?.data || typeof part.data !== "object" || Array.isArray(part.data)) continue;
    const options = part.data.passon && typeof part.data.passon === "object"
      ? part.data.passon
      : part.data;
    if (options.action || options.target) {
      return { action: options.action ?? "pull", target: options.target ?? "generic" };
    }
  }
  return { action: "pull", target: "generic" };
}

export function parsePassOnCapability(parts) {
  const candidates = [];
  for (const part of parts) {
    candidates.push(...candidateUrls(part?.text));
    const dataUrl = dataCapability(part?.data);
    if (dataUrl) candidates.push(dataUrl);
  }

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.pathname.replace(/\/$/, "") !== "/receiver") continue;
      const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
      const id = parsed.searchParams.get("id") ?? fragment.get("id");
      const token = parsed.searchParams.get("token") ?? fragment.get("token");
      if (/^[0-9a-f-]{36}$/i.test(id ?? "") && token) return { id, token };
    } catch {
      // Continue looking for another URL in the message.
    }
  }
  invalidParams(
    "A local PassOn receiver capability URL with id and token is required.",
    "message.parts",
  );
}

function validateRequest(body, version) {
  if (version !== A2A_PROTOCOL_VERSION) {
    throw new A2aError(
      -32009,
      `A2A version ${version || "0.3"} is not supported. Use A2A-Version: ${A2A_PROTOCOL_VERSION}.`,
      "VERSION_NOT_SUPPORTED",
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.jsonrpc !== "2.0") {
    throw new A2aError(-32600, "Request payload validation error", "INVALID_REQUEST");
  }
  if (!(typeof body.id === "string" || typeof body.id === "number")) {
    throw new A2aError(-32600, "A string or numeric JSON-RPC id is required.", "INVALID_REQUEST");
  }
  if (body.method !== "SendMessage") {
    throw new A2aError(-32601, "Method not found", "METHOD_NOT_FOUND");
  }
  const message = body.params?.message;
  if (!message || typeof message !== "object") invalidParams("message is required.", "message");
  if (typeof message.messageId !== "string" || !message.messageId.trim()) {
    invalidParams("messageId is required.", "message.messageId");
  }
  if (message.role !== "ROLE_USER") invalidParams("role must be ROLE_USER.", "message.role");
  if (!Array.isArray(message.parts) || !message.parts.length) {
    invalidParams("At least one message part is required.", "message.parts");
  }
  return message;
}

function unavailable(error) {
  if (["NOT_FOUND", "FORBIDDEN", "EXPIRED", "INTEGRITY_FAILURE"].includes(error?.code)) {
    return new A2aError(-32001, "PassOn handoff is unavailable.", "TASK_NOT_FOUND");
  }
  if (["AGENT_NOT_CONFIGURED", "POD_UNAVAILABLE"].includes(error?.code)) {
    return new A2aError(-32004, error.message, "UNSUPPORTED_OPERATION");
  }
  return error;
}

async function pullHandoff(record, dependencies, target) {
  const payload = {
    action: "pull",
    record: publicRecord(record),
    resumePrompt: renderPrompt(record, target),
  };
  if (!record.workPod) return payload;

  const pulled = await dependencies.workPodProvider.pull(record.workPod);
  const { camp, handoff, ...metadata } = pulled;
  await dependencies.store.update(record.id, (current) => ({ ...current, workPod: metadata }));
  payload.workPod = { ...metadata, camp, handoff };
  return payload;
}

async function runAgent(record, dependencies, target) {
  if (!record.workPod) {
    throw new A2aError(-32004, "Autonomous continuation requires a work pod.", "UNSUPPORTED_OPERATION");
  }
  if (!dependencies.agentRunner.status().configured) {
    throw new A2aError(-32004, "No autonomous harness is configured.", "UNSUPPORTED_OPERATION");
  }
  const result = await dependencies.agentRunner.run(renderPrompt(record, target));
  const workPod = await dependencies.workPodProvider.storeAgentResult(record.workPod, result);
  const status = result.exitCode === 0 ? "agent-completed" : "agent-failed";
  const runSummary = {
    id: result.id,
    harness: result.harness,
    completedAt: result.completedAt,
    exitCode: result.exitCode,
    artifact: `agents/${result.id}.json`,
  };
  await dependencies.store.update(record.id, (current) => ({
    ...current,
    status,
    workPod,
    agentRuns: [...(current.agentRuns ?? []), runSummary],
  }));
  return { action: "agent-run", status, result, workPod };
}

export function createA2aAgentCard(origin) {
  return {
    name: "PassOn Context Port",
    description: "Pulls a sealed PassOn handoff into another agent and can invoke a configured autonomous harness.",
    supportedInterfaces: [{
      url: `${origin.replace(/\/$/, "")}/a2a`,
      protocolBinding: "JSONRPC",
      protocolVersion: A2A_PROTOCOL_VERSION,
    }],
    provider: { organization: "PassOn", url: origin },
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [{
      id: "passon-handoff",
      name: "PassOn handoff",
      description: "Pull a local PassOn capability URL. A structured data part may set action to pull or agent-run and target to a supported harness renderer. The capability URL authorizes only its named handoff; no server-level A2A authentication is configured.",
      tags: ["handoff", "context", "long-horizon", "agent-continuation"],
      examples: [
        "Continue from http://127.0.0.1:4317/receiver#id=<uuid>&token=<capability>",
        "{\"passon\":{\"shareUrl\":\"<url>\",\"action\":\"agent-run\",\"target\":\"generic\"}}",
      ],
      inputModes: ["text/plain", "application/json"],
      outputModes: ["text/plain", "application/json"],
    }],
  };
}

export async function handleA2aJsonRpc(body, dependencies, options = {}) {
  const id = body && typeof body === "object" ? body.id : null;
  try {
    const message = validateRequest(body, options.version ?? "0.3");
    const { id: passonId, token } = parsePassOnCapability(message.parts);
    const { action, target } = requestOptions(message.parts);
    if (!SUPPORTED_TARGETS.includes(target)) invalidParams(`Unsupported target: ${target}`, "message.parts.data.target");
    if (!["pull", "agent-run"].includes(action)) {
      invalidParams("action must be pull or agent-run.", "message.parts.data.action");
    }

    const record = assertReadable(await dependencies.store.get(passonId), token);
    const output = action === "agent-run"
      ? await runAgent(record, dependencies, target)
      : await pullHandoff(record, dependencies, target);
    const contextId = message.contextId || randomUUID();
    const summary = action === "agent-run"
      ? `PassOn autonomous continuation finished with status ${output.status}.`
      : `PassOn handoff ${record.id} is ready to continue.`;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        message: {
          messageId: randomUUID(),
          contextId,
          role: "ROLE_AGENT",
          parts: [
            { text: summary, mediaType: "text/plain" },
            { data: output, mediaType: "application/json" },
          ],
          metadata: {
            passonId: record.id,
            digest: record.digest,
            authorization: "capability-url",
          },
        },
      },
    };
  } catch (error) {
    const mapped = unavailable(error);
    if (mapped instanceof A2aError) {
      return a2aErrorResponse(id, mapped.code, mapped.message, {
        reason: mapped.reason,
        field: mapped.field,
      });
    }
    return a2aErrorResponse(id, -32603, "Internal error", { reason: "INTERNAL" });
  }
}
