import { readFile } from "node:fs/promises";
import { estimateCost } from "../src/cost.mjs";

const scenarios = {
  conservative: {
    passonsPerMonth: 500,
    rawContextTokens: 50_000,
    capsuleTokens: 10_000,
    inputCostPerMillionTokens: 2,
    baselineResumeFailureRate: 0.10,
    passonResumeFailureRate: 0.08,
    recoveryMinutesPerFailure: 15,
    loadedLaborCostPerHour: 75,
    monthlyInfrastructureCost: 25,
    oneTimeBuildCost: 20_000,
  },
  base: {},
  highVolume: {
    passonsPerMonth: 10_000,
    rawContextTokens: 200_000,
    capsuleTokens: 20_000,
    inputCostPerMillionTokens: 5,
    baselineResumeFailureRate: 0.25,
    passonResumeFailureRate: 0.08,
    recoveryMinutesPerFailure: 45,
    loadedLaborCostPerHour: 125,
    monthlyInfrastructureCost: 250,
    oneTimeBuildCost: 100_000,
  },
};

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function print(name, estimate) {
  const { assumptions: a, results: r } = estimate;
  console.log(`\n${name}`);
  console.log(`  pass-ons / month:        ${a.passonsPerMonth.toLocaleString()}`);
  console.log(`  context tokens:          ${a.rawContextTokens.toLocaleString()} -> ${a.capsuleTokens.toLocaleString()}`);
  console.log(`  assumed resume failures: ${(a.baselineResumeFailureRate * 100).toFixed(1)}% -> ${(a.passonResumeFailureRate * 100).toFixed(1)}%`);
  console.log(`  token savings / month:   ${money(r.tokenSavings)}`);
  console.log(`  recovery savings / month:${money(r.recoverySavings)}`);
  console.log(`  net savings / month:     ${money(r.netMonthlySavings)}`);
  console.log(`  build-cost payback:      ${r.paybackMonths === null ? "never" : `${r.paybackMonths.toFixed(1)} months`}`);
  console.log(`  token share of value:    ${(r.tokenSavingsShare * 100).toFixed(1)}%`);
}

const inputPath = process.argv[2];
if (inputPath) {
  print("Custom assumptions", estimateCost(JSON.parse(await readFile(inputPath, "utf8"))));
} else {
  for (const [name, assumptions] of Object.entries(scenarios)) print(name, estimateCost(assumptions));
  console.log("\nThese are sensitivity scenarios, not measured product results.");
  console.log("The business case depends mainly on reducing failed resumes and repeated human work, not token savings.");
}
