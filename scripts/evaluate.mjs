import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/evaluate.mjs <results.json>");
const input = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(input.runs) || !input.runs.length) throw new Error("results.json must contain a non-empty runs array.");

const groups = new Map();
for (const run of input.runs) {
  if (!groups.has(run.condition)) groups.set(run.condition, []);
  groups.get(run.condition).push(run);
}

const mean = (rows, key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0) / rows.length;
console.log(input.label ?? "Resume benchmark");
console.log("condition\truns\tsuccess\tresume_min\tinput_tokens\trepeated\tfalse_claims");
for (const [condition, rows] of groups) {
  const success = rows.filter((row) => row.success).length / rows.length;
  console.log([
    condition,
    rows.length,
    `${(success * 100).toFixed(1)}%`,
    mean(rows, "resumeMinutes").toFixed(1),
    mean(rows, "inputTokens").toFixed(0),
    mean(rows, "repeatedActions").toFixed(1),
    mean(rows, "falseInheritedClaims").toFixed(1),
  ].join("\t"));
}
