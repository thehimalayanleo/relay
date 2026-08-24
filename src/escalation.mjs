const FAILURE_PATTERNS = [
  /tests?\s+(?:are\s+)?fail(?:ed|ing)?/i,
  /unable to (?:complete|solve|proceed)/i,
  /repeated (?:the same )?(?:hypothesis|error|failure)/i,
];

export function escalationDecision(result, options = {}) {
  if (options.enabled === false || options.attempt >= 1) return { escalate: false, reason: null };
  if (result?.timedOut) return { escalate: true, reason: "fast model timed out" };
  if (Number(result?.exitCode ?? 1) !== 0) return { escalate: true, reason: `fast model exited with status ${result.exitCode}` };
  const response = String(options.response ?? "").trim();
  if (!response || response === "OpenCode completed with no text response.") return { escalate: true, reason: "fast model returned no usable response" };
  if (options.noProgress === true && Number(options.stepCount ?? 0) >= Number(options.stepBudget ?? 10)) return { escalate: true, reason: `fast model made no verified progress within ${options.stepBudget ?? 10} steps` };
  const matched = FAILURE_PATTERNS.find((pattern) => pattern.test(response));
  return matched ? { escalate: true, reason: "fast model reported a blocked or failed attempt" } : { escalate: false, reason: null };
}

export function greptileEvidence(session, limit = 3) {
  return Object.values(session?.greptile?.findings ?? {})
    .filter((finding) => finding.state === "open")
    .slice(0, limit)
    .map((finding) => `${finding.id}${finding.path ? ` in ${finding.path}` : ""}: ${finding.summary || "Open Greptile finding"}`);
}

export function escalationPrompt(prompt, { reason, evidence, initialResponse }) {
  return `${prompt}\n\nRelay bounded escalation:\nThe fast model attempt failed because ${reason}.\n${evidence.length ? `Greptile repository evidence:\n${evidence.map((item) => `- ${item}`).join("\n")}` : "Greptile returned no open repository findings for this retry."}\nPrevious attempt transcript:\n${String(initialResponse).slice(-4_000)}\n\nContinue from the same sealed checkpoint. Correct the failure with a bounded approach. Do not repeat an exhausted hypothesis.`;
}
