import { randomUUID } from "node:crypto";

function clean(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function normalizeInboundMessage(input = {}, now = new Date()) {
  const sender = input.sender && typeof input.sender === "object" ? input.sender : {};
  const source = input.source && typeof input.source === "object" ? input.source : {};
  const value = clean(input.text ?? input.value ?? input.detail, 4_000);
  if (!value) throw new TypeError("Message text is required.");
  const platform = clean(source.platform, 40).toLowerCase() || "web";
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(platform)) throw new TypeError("Message platform must be URL-safe.");
  return {
    id: randomUUID(),
    type: "chat",
    actor: clean(sender.name ?? input.actor, 80) || "Collaborator",
    actorRole: clean(sender.role ?? input.role, 80) || "Participant",
    detail: value.slice(0, 500),
    value,
    source: {
      platform,
      threadId: clean(source.threadId, 240),
      messageId: clean(source.messageId, 240),
    },
    at: now.toISOString(),
  };
}

export function messagesFromSession(record) {
  const human = (record.activity ?? [])
    .filter((event) => event.type === "chat" && (event.value || event.detail))
    .map((event) => ({
      id: event.id,
      kind: "human",
      text: event.value || event.detail,
      author: { name: event.actor, role: event.actorRole || "Participant" },
      source: event.source ?? { platform: "web", threadId: "", messageId: "" },
      createdAt: event.at,
    }));
  const agent = (record.agentRuns ?? [])
    .filter((run) => run.response)
    .map((run) => ({
      id: run.id,
      kind: "agent",
      text: run.response,
      author: { name: "Relay", role: "Shared agent" },
      source: { platform: "relay", threadId: record.id, messageId: run.id },
      createdAt: run.completedAt,
    }));
  return [...human, ...agent].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
