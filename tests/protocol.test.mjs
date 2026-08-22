import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReadable,
  canonicalStringify,
  createRecord,
  digestCapsule,
  hashToken,
  normalizeCapsule,
  scanSecrets,
} from "../src/protocol.mjs";
import { renderPrompt } from "../src/adapters.mjs";

const sample = {
  title: "Continue parser repair",
  goal: "Finish the parser fix without changing the public API.",
  acceptanceCriteria: ["Targeted and full tests pass"],
  state: { completed: ["Reproduced the bug"], partial: [], blocked: [] },
  constraints: ["Preserve the public API"],
  nextAction: "Inspect src/parser.js and run the targeted test.",
  source: { harness: "codex", model: "test-model" },
};

test("normalizes and seals a deterministic capsule", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const normalized = normalizeCapsule(sample, now);
  assert.equal(normalized.schemaVersion, "passon/v1");
  assert.equal(normalized.createdAt, now.toISOString());
  assert.match(digestCapsule(normalized), /^sha256:[0-9a-f]{64}$/);
  assert.equal(canonicalStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("requires the minimum resume contract", () => {
  assert.throws(() => normalizeCapsule({ title: "x", goal: "y" }), /nextAction is required/);
});

test("rejects likely secrets without returning the credential", () => {
  const credential = `sk-${"x".repeat(24)}`;
  const input = { ...sample, traceSummary: `Never include ${credential}` };
  assert.deepEqual(scanSecrets(input), ["OpenAI-style API key"]);
  assert.throws(() => createRecord(input), (error) => {
    assert.equal(error.code, "SECRET_DETECTED");
    assert.doesNotMatch(error.message, new RegExp(credential));
    return true;
  });
});

test("capability token, expiry, and integrity are enforced", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const { record, token } = createRecord(sample, {
    id: "00000000-0000-4000-8000-000000000001",
    token: "test-capability-token",
    ttlHours: 1,
    now,
  });
  assert.equal(record.tokenHash, hashToken(token));
  assert.equal(assertReadable(record, token, now).id, record.id);
  assert.throws(() => assertReadable(record, "wrong", now), /Invalid capability token/);
  assert.throws(() => assertReadable(record, token, new Date("2026-08-22T14:00:00.000Z")), /expired/);
  assert.throws(() => assertReadable({ ...record, capsule: { ...record.capsule, goal: "tampered" } }, token, now), /integrity/);
});

test("renders target-specific prompts from the same canonical state", () => {
  const { record } = createRecord(sample, { token: "token" });
  const codex = renderPrompt(record, "codex");
  const claude = renderPrompt(record, "claude");
  assert.match(codex, /Open the relevant project in Codex/);
  assert.match(claude, /Claude Code/);
  assert.match(codex, new RegExp(record.digest));
  assert.match(codex, /Preserve the public API/);
});
