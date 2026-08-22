import assert from "node:assert/strict";
import test from "node:test";
import { estimateCost } from "../src/cost.mjs";

test("cost model separates token and failure-recovery value", () => {
  const estimate = estimateCost({
    passonsPerMonth: 1_000,
    rawContextTokens: 50_000,
    capsuleTokens: 10_000,
    inputCostPerMillionTokens: 2,
    baselineResumeFailureRate: 0.2,
    passonResumeFailureRate: 0.1,
    recoveryMinutesPerFailure: 30,
    loadedLaborCostPerHour: 100,
    monthlyInfrastructureCost: 20,
    oneTimeBuildCost: 10_000,
  });
  assert.equal(estimate.results.tokenSavings, 80);
  assert.equal(estimate.results.avoidedFailures, 100);
  assert.equal(estimate.results.recoverySavings, 5_000);
  assert.equal(estimate.results.netMonthlySavings, 5_060);
  assert.ok(estimate.results.paybackMonths > 1 && estimate.results.paybackMonths < 2);
});
