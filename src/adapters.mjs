function bullets(items, empty = "None recorded") {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

function checks(items) {
  return items.length
    ? items.map((item) => `- [${item.status}] ${item.command || "check"}: ${item.result || "no result supplied"}`).join("\n")
    : "- No validation supplied. Treat all state as unverified.";
}

function artifacts(items) {
  return items.length
    ? items.map((item) => `- [${item.status}] ${item.label || item.uri}: ${item.uri}${item.digest ? ` (${item.digest})` : ""}`).join("\n")
    : "- No artifacts supplied.";
}

export function renderPrompt(record, target = "generic") {
  const c = record.capsule;
  const targetInstructions = {
    codex: "Open the relevant project in Codex. Verify the workspace and validation state before editing. Preserve unrelated user changes.",
    claude: "Open the relevant project in Claude Code. Inspect the cited artifacts and re-run the stated checks before editing.",
    cursor: "Open the relevant project in Cursor. Use this as task context, but confirm every cited file and validation claim before changing code.",
    opencode: "Load this checkpoint in OpenCode. Verify the cited workspace state and checks before using the configured model or tools.",
    generic: "Load this checkpoint into the receiving agent harness. Verify external state before taking the next action.",
    human: "Review the objective, decisions, evidence, and next action. Resolve any mismatch before accepting responsibility.",
  };
  const instruction = targetInstructions[target] ?? targetInstructions.generic;

  return `# Relay: ${c.title}

Integrity: ${record.digest}
Source: ${c.source.harness}${c.source.model ? ` / ${c.source.model}` : ""}

## Resume contract

${instruction}

Restate the objective, constraints, verified state, and your first action before proceeding. Do not silently repair contradictions.

## Objective

${c.goal}

## Acceptance criteria

${bullets(c.acceptanceCriteria)}

## Current state

### Completed
${bullets(c.state.completed)}

### Partial
${bullets(c.state.partial)}

### Blocked
${bullets(c.state.blocked)}

## Decisions

${bullets(c.decisions)}

## Constraints

${bullets(c.constraints)}

## Rejected approaches

${bullets(c.rejectedApproaches)}

## Open questions

${bullets(c.openQuestions)}

## Artifacts

${artifacts(c.artifacts)}

## Validation

${checks(c.validation)}

## External side effects

${bullets(c.sideEffects)}

## Trace summary

${c.traceSummary || "No trace summary supplied."}

## Next safe action

${c.nextAction}

## Stop conditions

${bullets(c.stopConditions)}
`;
}

export const SUPPORTED_TARGETS = ["generic", "codex", "claude", "cursor", "opencode", "human"];
