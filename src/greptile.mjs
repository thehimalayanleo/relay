const MEMORY_TYPES = new Set([
  "finding",
  "evidence",
  "decision",
  "constraint",
  "rejected-approach",
  "test-result",
  "next-action",
]);

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function droppedContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const name = text(value.name, "Dropped context").slice(0, 160);
  const content = text(value.content).slice(0, 20_000);
  if (!content) return [];
  return [{ name, content, mediaType: text(value.mediaType, "text/plain").slice(0, 100) }];
}

function memory(input, fallback = {}) {
  const type = MEMORY_TYPES.has(input?.type) ? input.type : fallback.type ?? "evidence";
  const summary = text(input?.summary, fallback.summary);
  if (!summary) return null;
  return {
    type,
    summary,
    source: text(input?.source, fallback.source ?? "human-agent-loop"),
    confidence: ["low", "medium", "high", "verified"].includes(input?.confidence)
      ? input.confidence
      : fallback.confidence ?? "medium",
    occurredAt: text(input?.occurredAt, fallback.occurredAt ?? new Date().toISOString()),
    evidenceUri: text(input?.evidenceUri, fallback.evidenceUri),
  };
}

export function normalizeGreptileFinding(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("finding must be an object.");
  }
  const summary = text(input.summary ?? input.body ?? input.message);
  const repository = text(input.repository ?? input.repo);
  if (!summary) throw new TypeError("finding.summary is required.");
  if (!repository) throw new TypeError("finding.repository is required.");

  const trustedAdapter = Boolean(options.trustedAdapter ?? options.authenticated);
  return {
    source: "greptile",
    sourceMode: trustedAdapter ? "trusted-adapter-input" : "local-demo",
    findingId: text(input.findingId ?? input.id, "greptile-demo-finding"),
    summary,
    repository,
    pullRequest: text(input.pullRequest ?? input.prUrl),
    commit: text(input.commit ?? input.sha),
    severity: ["low", "medium", "high", "critical"].includes(input.severity)
      ? input.severity
      : "high",
    confidence: ["low", "medium", "high"].includes(input.confidence)
      ? input.confidence
      : "high",
    affectedPaths: list(input.affectedPaths ?? input.paths),
    evidence: list(input.evidence),
    observedAt: text(input.observedAt, new Date().toISOString()),
  };
}

export function greptileHandoffCapsule(payload, options = {}) {
  const finding = normalizeGreptileFinding(payload.finding ?? payload, options);
  const investigation = payload.investigation ?? {};
  const evidenceUri = finding.pullRequest;
  const contextDrops = droppedContext(payload.contextDrop);
  const memories = [
    memory({
      type: "finding",
      summary: finding.summary,
      source: "greptile",
      confidence: finding.confidence,
      occurredAt: finding.observedAt,
      evidenceUri,
    }),
    ...finding.evidence.map((summary) => memory({
      type: "evidence",
      summary,
      source: "greptile",
      confidence: finding.confidence,
      occurredAt: finding.observedAt,
      evidenceUri,
    })),
    ...list(investigation.completed).map((summary) => memory({
      type: "evidence", summary, source: "user-1-agent", confidence: "verified",
    })),
    ...list(investigation.decisions).map((summary) => memory({
      type: "decision", summary, source: "user-1", confidence: "verified",
    })),
    ...list(investigation.constraints).map((summary) => memory({
      type: "constraint", summary, source: "user-1", confidence: "verified",
    })),
    ...list(investigation.rejectedApproaches).map((summary) => memory({
      type: "rejected-approach", summary, source: "user-1-agent", confidence: "verified",
    })),
    ...contextDrops.map((item) => memory({
      type: "evidence",
      summary: `Dropped context: ${item.name}\n${item.content}`,
      source: "user-1-context-drop",
      confidence: "medium",
    })),
  ].filter(Boolean);

  const nextAction = text(
    investigation.nextAction ?? payload.nextAction,
    "Reproduce the Greptile finding with the smallest targeted test before changing code.",
  );
  memories.push(memory({
    type: "next-action",
    summary: nextAction,
    source: "relay",
    confidence: "verified",
  }));

  const modeLabel = finding.sourceMode === "trusted-adapter-input"
    ? "Trusted adapter input; Greptile API retrieval not independently verified"
    : "Local demo input; not fetched from Greptile";

  return {
    title: `Greptile finding: ${finding.repository}`,
    goal: text(payload.goal, `Resolve the ${finding.severity}-severity Greptile finding without introducing a regression.`),
    acceptanceCriteria: list(payload.acceptanceCriteria).length
      ? list(payload.acceptanceCriteria)
      : ["The targeted regression test passes", "Greptile re-review no longer reports the finding"],
    state: {
      completed: list(investigation.completed),
      partial: [`Greptile identified ${finding.affectedPaths.length || "the relevant"} affected code path(s).`],
      blocked: list(investigation.blocked),
    },
    decisions: list(investigation.decisions),
    constraints: list(investigation.constraints),
    rejectedApproaches: list(investigation.rejectedApproaches),
    openQuestions: list(investigation.openQuestions),
    artifacts: [
      ...(finding.pullRequest ? [{ label: "Greptile pull-request finding", uri: finding.pullRequest, status: "verified" }] : []),
      ...finding.affectedPaths.map((uri) => ({ label: "Affected code path", uri, status: "unverified" })),
      ...contextDrops.map((item) => ({ label: `Context drop: ${item.name}`, uri: `inline://${encodeURIComponent(item.name)}`, status: "unverified" })),
    ],
    validation: [],
    traceSummary: `${modeLabel}. ${finding.summary}`,
    nextAction,
    source: {
      harness: "greptile-relay-adapter",
      model: "greptile",
      actor: "user-1-agent",
      taskId: finding.findingId,
    },
    intendedRecipient: text(payload.intendedRecipient, "codex"),
    memories,
    integration: { greptile: finding },
  };
}
