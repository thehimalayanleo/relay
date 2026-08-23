import assert from "node:assert/strict";
import test from "node:test";
import { findingFromGreptileComment, improvementLoopDecision } from "../src/improvement-loop.mjs";

test("recursive improvement stops cleanly when Greptile has no unresolved comments", () => {
  assert.equal(improvementLoopDecision({ comments: [], iteration: 2 }).status, "complete");
});

test("recursive improvement stops at its frozen iteration budget", () => {
  const result = improvementLoopDecision({ comments: [{ body: "fix me" }], iteration: 4, maxIterations: 3 });
  assert.equal(result.status, "stopped");
  assert.equal(result.reason, "iteration-budget-exhausted");
});

test("maps a Greptile comment into a provenance-bearing finding", () => {
  const finding = findingFromGreptileComment({ id: "c1", body: "Null path", path: "src/a.js" }, {
    name: "acme/repo", prNumber: 7,
  });
  assert.equal(finding.repository, "acme/repo");
  assert.deepEqual(finding.paths, ["src/a.js"]);
});
