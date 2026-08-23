function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function estimateCost(input = {}) {
  const assumptions = {
    relaysPerMonth: finite(input.relaysPerMonth, 2_000),
    rawContextTokens: finite(input.rawContextTokens, 100_000),
    capsuleTokens: finite(input.capsuleTokens, 12_000),
    inputCostPerMillionTokens: finite(input.inputCostPerMillionTokens, 3),
    baselineResumeFailureRate: finite(input.baselineResumeFailureRate, 0.18),
    relayResumeFailureRate: finite(input.relayResumeFailureRate, 0.08),
    recoveryMinutesPerFailure: finite(input.recoveryMinutesPerFailure, 30),
    loadedLaborCostPerHour: finite(input.loadedLaborCostPerHour, 100),
    monthlyInfrastructureCost: finite(input.monthlyInfrastructureCost, 50),
    oneTimeBuildCost: finite(input.oneTimeBuildCost, 30_000),
  };

  const tokenSavings =
    assumptions.relaysPerMonth *
    Math.max(0, assumptions.rawContextTokens - assumptions.capsuleTokens) *
    assumptions.inputCostPerMillionTokens / 1_000_000;
  const avoidedFailures =
    assumptions.relaysPerMonth *
    Math.max(0, assumptions.baselineResumeFailureRate - assumptions.relayResumeFailureRate);
  const recoverySavings =
    avoidedFailures *
    assumptions.recoveryMinutesPerFailure / 60 *
    assumptions.loadedLaborCostPerHour;
  const grossMonthlySavings = tokenSavings + recoverySavings;
  const netMonthlySavings = grossMonthlySavings - assumptions.monthlyInfrastructureCost;
  const paybackMonths = netMonthlySavings > 0
    ? assumptions.oneTimeBuildCost / netMonthlySavings
    : null;

  return {
    assumptions,
    results: {
      tokenSavings,
      avoidedFailures,
      recoverySavings,
      grossMonthlySavings,
      netMonthlySavings,
      paybackMonths,
      tokenSavingsShare: grossMonthlySavings > 0 ? tokenSavings / grossMonthlySavings : 0,
    },
    warning: "This is a sensitivity model, not empirical proof. Replace the resume failure rates with measured benchmark or production results.",
  };
}
