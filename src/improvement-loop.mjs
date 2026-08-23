function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function greptileComments(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["comments", "items", "results"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

export function findingFromGreptileComment(comment, context) {
  const body = text(comment?.body ?? comment?.content ?? comment?.message ?? comment?.summary);
  if (!body) throw new TypeError("Greptile comment has no finding text.");
  const path = text(comment?.path ?? comment?.filePath ?? comment?.location?.path);
  return {
    id: text(comment?.id ?? comment?.commentId, `greptile-pr-${context.prNumber}`),
    repository: context.name,
    prUrl: text(comment?.url ?? comment?.htmlUrl),
    sha: text(comment?.commitSha ?? comment?.sha),
    summary: body,
    severity: ["low", "medium", "high", "critical"].includes(comment?.severity)
      ? comment.severity
      : "medium",
    confidence: "high",
    paths: path ? [path] : [],
    evidence: [text(comment?.reasoning ?? comment?.evidence)].filter(Boolean),
  };
}

export function improvementLoopDecision(input) {
  const iteration = Number(input.iteration ?? 1);
  const maxIterations = Number(input.maxIterations ?? 3);
  if (!Number.isInteger(iteration) || iteration < 1) throw new TypeError("iteration must be a positive integer.");
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 5) {
    throw new TypeError("maxIterations must be an integer between 1 and 5.");
  }
  const comments = greptileComments(input.comments);
  if (!comments.length) {
    return { status: "complete", reason: "no-unresolved-greptile-comments", iteration, maxIterations };
  }
  if (iteration > maxIterations) {
    return { status: "stopped", reason: "iteration-budget-exhausted", iteration, maxIterations };
  }
  return {
    status: "action-required",
    reason: "unresolved-greptile-comment",
    iteration,
    maxIterations,
    comment: comments[0],
    remainingFindings: comments.length,
  };
}
