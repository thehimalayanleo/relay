import assert from "node:assert/strict";
import test from "node:test";
import { messagesFromSession, normalizeInboundMessage } from "../src/chat-bridge.mjs";

test("normalizes a platform message without retaining raw provider payloads", () => {
  const message = normalizeInboundMessage({
    sender: { name: "Maya", role: "Partner" },
    text: "I prefer a medium-firm mattress.",
    source: { platform: "imessage", threadId: "family", messageId: "m-1", raw: { secret: true } },
  }, new Date("2026-08-24T12:00:00Z"));
  assert.equal(message.actor, "Maya");
  assert.equal(message.source.platform, "imessage");
  assert.equal(message.source.messageId, "m-1");
  assert.equal("raw" in message.source, false);
});

test("exports one chronological cross-platform thread", () => {
  const messages = messagesFromSession({
    id: "session-1",
    activity: [{ id: "human-1", type: "chat", actor: "Maya", actorRole: "Partner", value: "Medium firm", at: "2026-08-24T12:00:00Z", source: { platform: "imessage" } }],
    agentRuns: [{ id: "agent-1", response: "What is your budget?", completedAt: "2026-08-24T12:00:01Z" }],
  });
  assert.deepEqual(messages.map((message) => message.kind), ["human", "agent"]);
  assert.equal(messages[1].source.platform, "relay");
});
