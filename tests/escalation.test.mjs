import assert from "node:assert/strict";
import test from "node:test";
import { escalationDecision, escalationPrompt, greptileEvidence } from "../src/escalation.mjs";

test("escalates one failed fast-model attempt", () => {
  assert.deepEqual(escalationDecision({ exitCode: 1 }, { attempt: 0, response: "failed" }), {
    escalate: true,
    reason: "fast model exited with status 1",
  });
  assert.equal(escalationDecision({ exitCode: 1 }, { attempt: 1, response: "failed" }).escalate, false);
});

test("does not escalate a successful bounded attempt", () => {
  assert.equal(escalationDecision({ exitCode: 0 }, { attempt: 0, response: "Implemented and tests pass.", progressCount: 4, stepBudget: 10 }).escalate, false);
});

test("supplies only open Greptile evidence to the retry", () => {
  const evidence = greptileEvidence({ greptile: { findings: {
    open: { id: "G-1", path: "src/a.mjs", summary: "Guard the empty state", state: "open" },
    closed: { id: "G-2", summary: "Already fixed", state: "closed" },
  } } });
  assert.deepEqual(evidence, ["G-1 in src/a.mjs: Guard the empty state"]);
  const prompt = escalationPrompt("original", { reason: "tests failed", evidence, initialResponse: "failure transcript" });
  assert.match(prompt, /same sealed checkpoint/);
  assert.match(prompt, /G-1 in src\/a\.mjs/);
  assert.match(prompt, /failure transcript/);
});
