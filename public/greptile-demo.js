const byId = (id) => document.getElementById(id);
const RECENTS_KEY = "relay.sessions.v1";
let active, snapshot, stream, presenceTimer, memoryTimer, memoryContext;
let claudeMemReady = false;
let liveAgentStartedAt = null;
let selectedWorkspace = null;
let discoveredWorkspaces = null;
let greptileUiStage = null;
const syncedSessions = new Set();

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const compactTraceText = (value) => String(value ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
function formatAgentText(value) {
  return esc(value).split("\n").map((line) => {
    if (!line.trim()) return '<span class="response-gap"></span>';
    const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return line.startsWith("- ")
      ? `<span class="response-line response-bullet"><i>•</i><span>${bold.slice(2)}</span></span>`
      : `<span class="response-line">${bold}</span>`;
  }).join("");
}
const cleanLabel = (value) => String(value ?? "Agent").replace(/^\*\*|\*\*$/g, "").replace(/^\\+|\\+$/g, "").trim();
async function json(response) { const body = await response.json(); if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`); return body; }
const authHeaders = (extra = {}) => ({ authorization: `Bearer ${active.token}`, ...extra });
function fromHash() { const p = new URLSearchParams(location.hash.slice(1)); const requestedRole = p.get("role"); const role = ["pm", "collaborator", "agent"].includes(requestedRole) ? requestedRole : "swe"; return p.get("session") && p.get("token") ? { id: p.get("session"), token: p.get("token"), role } : null; }
function collaboratorView() { return ["pm", "collaborator"].includes(active?.role); }
function profileKey() { return `relay.profile.${active?.role ?? "swe"}`; }
function person() {
  if (active.role === "agent") return { id: `relay-agent-${active.id}`, name: "Relay agent", role: "Standalone", color: "#ff5a1f" };
  const side = collaboratorView() ? snapshot?.people?.collaborator : snapshot?.people?.creator;
  const savedName = localStorage.getItem(profileKey());
  const name = savedName || side?.name || (collaboratorView() ? "Partner" : "Host");
  return {
    id: `${collaboratorView() ? "collaborator" : "host"}-${active.id}`,
    name,
    role: side?.role || (snapshot?.mode === "build" ? (collaboratorView() ? "Collaborator" : "Builder") : "Partner"),
    color: collaboratorView() ? "#ff5a1f" : "#7aa2f7",
  };
}
function recents() { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; } }
function remember() {
  const item = { ...active, title: snapshot.title, updatedAt: snapshot.updatedAt };
  const merged = [item, ...recents().filter((entry) => entry.id !== item.id)]
    .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    .slice(0, 12);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(merged));
  renderSessions();
}
const status = (message) => { byId("truth").textContent = message; };
async function syncGreptile(attempts = 1) {
  if (!snapshot?.repository?.prNumber) return null;
  greptileUiStage = { label: "Syncing findings", state: "busy" }; renderRepository();
  try {
    const metrics = await json(await fetch(`/v1/sessions/${active.id}/greptile/sync`, { method: "POST", headers: authHeaders() }));
    greptileUiStage = metrics.totals?.opened === 0 ? { label: "Review passed", state: "ready" } : { label: "Findings ready", state: "ready" };
    renderRepository();
    if (attempts > 1) setTimeout(() => syncGreptile(attempts - 1), 10_000);
    return metrics;
  } catch (error) {
    greptileUiStage = { label: "Greptile unavailable", state: "error" }; renderRepository();
    byId("greptile-pill").textContent = "Greptile · PR not indexed";
    throw error;
  }
}

function renderRepository() {
  if (!snapshot) return;
  const repository = snapshot.repository ?? {};
  const github = repository.remote === "github";
  const decisionMode = snapshot.mode === "decision";
  byId("repo-mark").textContent = decisionMode ? "↗" : github ? "GH" : "LOCAL";
  byId("repo-label").textContent = decisionMode ? "Shared decision" : github ? "Connected repository" : "Workspace";
  byId("repo-connection").textContent = decisionMode
    ? snapshot.title
    : repository.remote === "github"
    ? `${repository.name}${repository.prNumber ? ` / pull ${repository.prNumber}` : ""}`
    : repository.name || "Local workspace";
  let stage = greptileUiStage;
  if (!stage) {
    const samples = snapshot.greptile?.samples ?? [];
    const latest = samples.at(-1);
    const reviewRequested = [...(snapshot.activity ?? [])].reverse().find((event) => event.type === "greptile" && /review requested/i.test(event.detail));
    const requestPending = reviewRequested && (!snapshot.greptile?.lastSyncAt || new Date(reviewRequested.at) > new Date(snapshot.greptile.lastSyncAt));
    stage = decisionMode ? { label: "Shared agent ready", state: "ready" }
      : repository.remote !== "github" ? { label: "Local workspace", state: "ready" }
      : !repository.prNumber ? { label: "Waiting for pull request", state: "ready" }
      : requestPending ? { label: "Review requested", state: "busy" }
      : latest?.opened === 0 && samples.length ? { label: "Review passed", state: "ready" }
      : samples.length ? { label: "Findings ready", state: "ready" }
      : { label: "GitHub connected", state: "ready" };
  }
  const element = byId("greptile-stage");
  element.dataset.state = stage.state;
  element.querySelector("span").textContent = stage.label;
}

function renderDecision() {
  const card = byId("decision-card");
  const decisionMode = snapshot?.mode === "decision";
  card.hidden = !decisionMode;
  if (!decisionMode) return;
  const decision = snapshot.decision ?? { status: "open", proposal: "", rationale: "", nextStep: "", approvals: [] };
  const approvals = decision.approvals ?? [];
  const current = person();
  const approved = approvals.some((item) => item.actorId === current.id);
  const settled = decision.status === "decided";
  card.classList.toggle("decided", settled);
  byId("decision-label").textContent = settled ? "Agreed outcome" : decision.proposal ? "Proposed outcome" : "Shared outcome";
  byId("decision-outcome").textContent = decision.proposal || "No decision proposed yet";
  byId("decision-detail").textContent = decision.proposal
    ? [decision.rationale, decision.nextStep ? `Next: ${decision.nextStep}` : ""].filter(Boolean).join("\n") || "Waiting for both people to agree."
    : "Discuss the tradeoffs, then propose an outcome for both people to approve.";
  byId("decision-count").textContent = settled ? "2 of 2 agreed" : `${Math.min(2, approvals.length)} of 2 agreed`;
  byId("propose-decision").textContent = decision.proposal ? "Revise" : "Propose";
  const approve = byId("approve-decision");
  approve.hidden = !decision.proposal || settled;
  approve.disabled = approved;
  approve.textContent = approved ? "Agreed" : "Agree";
}
function liveAgentEvent() {
  const activity = snapshot.activity ?? [];
  const runs = snapshot.agentRuns ?? [];
  return [...activity].reverse().find((event) => ["agent-running", "agent-progress"].includes(event.type)
    && !runs.some((run) => run.requestedBy === event.actor && new Date(run.completedAt) >= new Date(event.at))
    && !activity.some((later) => later.type === "agent-failed" && later.actor === event.actor && new Date(later.at) >= new Date(event.at)));
}

function renderSessions() {
  const list = recents();
  byId("sessions").innerHTML = list.length ? list.map((x) => `<button class="session-item ${x.id === active?.id ? "active" : ""}" data-session="${esc(x.id)}">${esc(x.title)}</button>`).join("") : '<span style="padding:8px 10px;color:#666;font-size:12px">No sessions yet</span>';
  for (const button of document.querySelectorAll("[data-session]")) button.onclick = () => { const next = list.find((x) => x.id === button.dataset.session); history.replaceState(null, "", `#session=${encodeURIComponent(next.id)}&token=${encodeURIComponent(next.token)}&role=${next.role}`); connect(next).catch((e) => status(e.message)); };
}

function renderFeed() {
  const exactRuns = (snapshot.agentRuns ?? []).filter((run) => run.exitCode === 0 && run.inheritedContext && run.response && run.response !== "OpenCode completed with no text response.");
  const messages = (snapshot.activity ?? []).filter((event) => event.type === "chat" && (event.value || event.detail));
  const liveAgent = liveAgentEvent();
  const started = liveAgent && [...(snapshot.activity ?? [])].reverse().find((event) => event.type === "agent-running" && event.actor === liveAgent.actor);
  liveAgentStartedAt = started?.at ?? liveAgent?.at ?? null;
  const liveHtml = liveAgent ? `<article class="event live-agent"><div class="avatar">↗</div><div class="bubble"><strong>${esc(cleanLabel(liveAgent.actor))}</strong><span class="inherited"><i class="live-dot"></i> Working now · <span id="live-elapsed">0s</span> · ${snapshot.mode === "decision" ? "shared with this thread" : "serialized through one Sailbox"}</span><div class="agent-response">${esc(liveAgent.detail)}</div><div class="live-track"><i></i></div></div></article>` : "";
  const timeline = [
    ...messages.map((event) => ({ at: event.at, html: `<article class="event"><div class="avatar">${esc((event.actor || "R")[0])}</div><div class="bubble"><strong>${esc(event.actor || "Relay")}${event.actorRole ? ` · ${esc(event.actorRole)}` : ""}</strong><time>${new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span class="inherited">Shared with everyone in this thread</span><div class="agent-response">${esc(event.value || event.detail)}</div></div></article>` })),
    ...exactRuns.map((run) => {
      const participant = cleanLabel(run.requestedBy);
      const inherited = snapshot.mode === "decision"
        ? `Goal: ${run.inheritedContext.problem}\nShared constraint: ${run.inheritedContext.constraint}\nLatest request: ${run.inheritedContext.nextAction}`
        : `Problem: ${run.inheritedContext.problem}\nConstraint: ${run.inheritedContext.constraint}\nNext: ${run.inheritedContext.nextAction}`;
      const escalation = run.escalation ? `<span class="inherited">Escalated once · ${esc(run.escalation.greptileEvidence.length)} Greptile finding${run.escalation.greptileEvidence.length === 1 ? "" : "s"} · checkpoint preserved</span>` : "";
      return { at: run.completedAt, html: `<article class="event"><div class="avatar">${esc(participant[0])}</div><div class="bubble"><strong>${esc(participant)}</strong><time>${new Date(run.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span class="inherited">${snapshot.mode === "decision" ? "Replied to the shared conversation" : "Completed through the serialized host queue"}</span>${escalation}<div class="agent-response formatted">${formatAgentText(run.response)}</div><details class="run-context"><summary>${snapshot.mode === "decision" ? "Decision context" : "Inherited context"}</summary><div class="agent-response">${esc(inherited)}</div></details></div></article>` };
    }),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));
  if (timeline.length || liveHtml) { byId("feed").innerHTML = timeline.map((item) => item.html).join("") + liveHtml; return; }
  const event = snapshot.activity?.at(-1);
  byId("feed").innerHTML = event ? `<article class="event"><div class="avatar">${esc((event.actor || "R")[0])}</div><div class="bubble"><strong>${esc(event.actor || "Relay")}</strong><p>${esc(event.detail)}</p></div></article>` : "";
}

function renderTrace() {
  const service = (event) => event.type === "checkpoint" ? "Relay" : event.type === "greptile" ? "Greptile" : event.type.startsWith("agent") ? (snapshot.mode === "decision" ? "Agent" : "OpenCode") : "Relay";
  const relevant = (snapshot.activity ?? []).filter((event) => ["checkpoint", "greptile", "agent-queued", "agent-running", "agent-progress", "agent-escalation", "agent-failed", "agent"].includes(event.type)).slice(-30);
  const rows = relevant.map((event) => `<div class="trace-row ${["agent-running", "agent-progress"].includes(event.type) ? "live" : ""}"><time>${new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><b>${service(event)}</b><span>${esc(compactTraceText(event.detail))}</span></div>`);
  if (liveAgentEvent()) rows.push(`<div class="trace-row live"><time>live</time><b>${snapshot.mode === "decision" ? "Agent" : "OpenCode"}</b><span id="trace-heartbeat">Model connected · waiting for the next update</span></div>`);
  if (snapshot.claudeMem?.lastRecallAt) rows.push(`<div class="trace-row"><time>${new Date(snapshot.claudeMem.lastRecallAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><b>Claude-Mem</b><span>${snapshot.claudeMem.observationIds.length} memory references supplied</span></div>`);
  byId("live-trace").innerHTML = rows.length ? rows.join("") : '<div class="trace-row"><time>now</time><b>Relay</b><span>Waiting for host work</span></div>';
  const trace = byId("live-trace");
  trace.scrollTop = trace.scrollHeight;
}

function renderGreptile() {
  const samples = snapshot.greptile?.samples ?? [];
  const latest = samples.at(-1) ?? { closed: 0, remaining: 0 };
  byId("greptile-addressed").textContent = latest.closed ?? 0;
  byId("greptile-open").textContent = latest.remaining ?? 0;
  byId("greptile-note").textContent = !snapshot.repository.prNumber
    ? "No pull request linked"
    : samples.length
      ? latest.opened === 0
        ? `Review ${latest.iteration} · passed`
        : `Review ${latest.iteration}`
      : "Waiting for first review";
  const max = Math.max(1, ...samples.flatMap((sample) => [sample.closed, sample.remaining]));
  const hasValues = samples.some((sample) => Number(sample.closed) + Number(sample.remaining) > 0);
  byId("greptile-spark").innerHTML = hasValues ? samples.map((sample) => `<span class="spark-sample" title="Review ${sample.iteration}: ${sample.closed} addressed, ${sample.remaining} open"><i style="height:${sample.closed / max * 100}%"></i><i class="open" style="height:${sample.remaining / max * 100}%"></i></span>`).join("") : samples.length ? '<span class="plot-empty">Review passed · 0 code findings</span>' : '<span class="plot-empty">No Greptile review samples yet</span>';
  const findings = Object.values(snapshot.greptile?.findings ?? {});
  byId("greptile-findings").innerHTML = findings.length ? findings.map((finding) => `<details class="finding"><summary><code>${esc(finding.id)}</code> · ${esc(finding.path || "repository")}${finding.state === "closed" ? " · addressed" : finding.state === "unknown" ? " · status unknown" : ""}</summary><p>${esc(finding.summary || "No finding text returned.")}</p></details>`).join("") : "";
}

function render(next) {
  snapshot = { ...next, links: next.links ?? snapshot?.links, hostIntegrations: next.hostIntegrations ?? snapshot?.hostIntegrations };
  byId("session-title-view").textContent = snapshot.title;
  const decisionMode = snapshot.mode === "decision";
  const current = person();
  byId("session-subtitle").textContent = snapshot.repository.remote === "github"
    ? `${snapshot.repository.name}${snapshot.repository.prNumber ? ` · PR #${snapshot.repository.prNumber}` : " · no pull request"} · v${snapshot.version}`
    : decisionMode ? `${snapshot.people.creator.name} + ${snapshot.people.collaborator.name} · shared decision · v${snapshot.version}` : `Local session · GitHub optional · v${snapshot.version}`;
  byId("profile-button").textContent = current.name[0]?.toUpperCase() || "?";
  byId("presence").innerHTML = snapshot.participants.map((p) => `<div class="avatar" style="background:${esc(p.color)}" title="${esc(p.name)} · ${esc(p.role)}">${esc(p.name[0])}</div>`).join("");
  if (!byId("composer").dataset.ready) { byId("composer").value = ""; byId("composer").dataset.ready = "true"; }
  const runs = snapshot.agentRuns ?? [];
  const liveAgent = liveAgentEvent();
  const latestRun = runs.filter((run) => run.exitCode === 0 && run.response && run.response !== "OpenCode completed with no text response.").at(-1);
  byId("coordination-state").textContent = liveAgent ? `${cleanLabel(liveAgent.actor)} · working` : decisionMode && latestRun ? "Shared agent replied" : decisionMode ? "One shared decision thread" : latestRun ? "1 agent continuation · 1 Sailbox" : "One serialized agent queue";
  byId("coordination-detail").textContent = liveAgent ? "Live host execution · the next request waits in queue" : decisionMode ? "Both people and the agent see the same conversation" : latestRun ? "Latest shared-stack continuation, preserved word for word" : `${snapshot.checkpoints.length} checkpoint${snapshot.checkpoints.length === 1 ? "" : "s"} · ready on host`;
  byId("host-mode").textContent = active.role === "agent" ? "Standalone agent mode" : collaboratorView() ? `Connected as ${current.name}` : "Host integrations ready";
  byId("host-help").textContent = active.role === "agent" ? "Runs without either browser open" : collaboratorView() ? "No local keys required" : "Powered by host integrations";
  byId("preview-session").href = snapshot.links?.collaboratorInviteUrl ?? snapshot.links?.pmInviteUrl ?? "#";
  byId("preview-session").textContent = `Preview as ${snapshot.people.collaborator.name}`;
  byId("activity-sources").textContent = decisionMode ? "Agent · memory · Relay checkpoint" : "OpenCode · Sail · Greptile · Claude-Mem";
  byId("composer").placeholder = decisionMode ? "Add a preference, constraint, or question…" : "Add context or direct the shared agent…";
  const greptileSamples = snapshot.greptile?.samples ?? [];
  const latestGreptile = snapshot.greptile?.samples?.at(-1) ?? { closed: 0, remaining: 0 };
  byId("greptile-panel").hidden = decisionMode || !snapshot.repository.prNumber;
  byId("greptile-pill").hidden = decisionMode || !snapshot.repository.prNumber;
  byId("greptile-pill").textContent = !snapshot.repository.prNumber
    ? "Greptile · waiting for PR"
    : greptileSamples.length && latestGreptile.opened === 0
      ? "Greptile · review passed"
      : `Greptile · ${latestGreptile.closed} addressed · ${latestGreptile.remaining} open`;
  document.querySelector(".conversation").classList.toggle("has-content", Boolean((snapshot.activity ?? []).length || (snapshot.agentRuns ?? []).length));
  renderRepository(); renderDecision(); renderFeed(); renderTrace(); renderGreptile(); remember();
  clearTimeout(memoryTimer); memoryTimer = setTimeout(recallMemory, 900);
}

async function connect(session) {
  stream?.close(); clearInterval(presenceTimer); active = session; greptileUiStage = null;
  render(await json(await fetch(`/v1/sessions/${active.id}`, { headers: authHeaders() })));
  active.inviteUrl = snapshot.links?.pmInviteUrl;
  await json(await fetch(`/v1/sessions/${active.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) }));
  presenceTimer = setInterval(() => fetch(`/v1/sessions/${active.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) }).catch(() => {}), 15000);
  stream = new EventSource(`/v1/sessions/${active.id}/events?token=${encodeURIComponent(active.token)}`);
  for (const name of ["workspace", "presence", "activity", "memory", "checkpoint", "greptile", "agent-queue"]) stream.addEventListener(name, (event) => render(JSON.parse(event.data)));
  stream.onerror = () => status("Reconnecting to the shared workspace…");
  status(collaboratorView() ? `You are in ${snapshot.people.creator.name}'s live workspace. No setup required.` : `Session ready · invite expires ${new Date(snapshot.expiresAt).toLocaleString()}`);
  if (collaboratorView() && !localStorage.getItem(profileKey())) {
    byId("profile-name").value = snapshot.people.collaborator.name === "Partner" ? "" : snapshot.people.collaborator.name;
    byId("profile-dialog").showModal();
    byId("profile-name").focus();
  }
  if (snapshot.repository.prNumber && !syncedSessions.has(active.id)) {
    syncedSessions.add(active.id);
    syncGreptile().then((metrics) => metrics && status(`Greptile review ${metrics.iteration} synced.`)).catch(() => {});
  }
}

async function updateField(field, value) {
  if (!active) return;
  render(await json(await fetch(`/v1/sessions/${active.id}/brief`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ ...person(), actor: person().name, actorId: person().id, field, value }) })));
}
async function submitMessage() {
  const value = byId("composer").value.trim();
  if (!value || byId("send").disabled) return;
  byId("send").disabled = true;
  try {
    const author = person();
    const result = await json(await fetch(`/v1/sessions/${active.id}/messages`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        sender: { name: author.name, role: author.role },
        text: value,
        source: { platform: "web", threadId: active.id, messageId: crypto.randomUUID() },
      }),
    }));
    render(result.snapshot);
    byId("composer").value = "";
    status("Saved. Sealing context for the host agent…");
    await json(await fetch(`/v1/sessions/${active.id}/checkpoints`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ actor: person().name }) }));
    status("Agent continuation queued on the host.");
    const requestedBy = snapshot.mode === "decision" ? "Relay · shared assistant" : `${author.name} agent · ${author.role}`;
    if (snapshot.mode === "build" && snapshot.repository.prNumber) {
      greptileUiStage = { label: "Requesting review", state: "busy" }; renderRepository();
      fetch(`/v1/sessions/${active.id}/greptile/review`, { method: "POST", headers: authHeaders() })
        .then(json).then(() => { greptileUiStage = { label: "Review running", state: "busy" }; renderRepository(); byId("greptile-pill").textContent = "Greptile · review running"; syncGreptile(6).catch(() => {}); })
        .catch((error) => { greptileUiStage = { label: error.message.includes("not found") ? "Repository not indexed" : "Review unavailable", state: "error" }; renderRepository(); byId("greptile-pill").textContent = `Greptile · ${error.message.includes("not found") ? "PR not indexed" : "review unavailable"}`; });
    }
    fetch(`/v1/sessions/${active.id}/agent/run`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ target: snapshot.mode === "decision" ? "generic" : "opencode", requestedBy, instructions: value }) })
      .then(json).then(() => { status("Host agent completed. Full response preserved above."); syncGreptile(3).catch(() => {}); }).catch((error) => status(`Agent failed: ${error.message}`));
  } catch (error) { status(error.message); }
  finally { byId("send").disabled = false; }
}
byId("send").onclick = submitMessage;
byId("composer").onkeydown = (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submitMessage();
};

async function recallMemory() {
  if (!claudeMemReady || !snapshot) return;
  byId("memory-pill").textContent = "Claude-Mem · recalling";
  try {
    memoryContext = await json(await fetch("/v1/integrations/claude-mem/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: `${snapshot.brief.problem} ${snapshot.brief.implementation}`, project: "relay", limit: 8 }) }));
    const ids = memoryContext.observationIds.filter((id) => !snapshot.claudeMem.observationIds.includes(String(id)));
    if (ids.length) await json(await fetch(`/v1/sessions/${active.id}/memory`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ observationIds: ids }) }));
    byId("memory-pill").textContent = memoryContext.observationIds.length ? `Claude-Mem · ${memoryContext.observationIds.length} recalled` : "Claude-Mem · listening";
  } catch { byId("memory-pill").textContent = "Claude-Mem · optional"; }
}

byId("invite-session").onclick = async () => { if (!snapshot) return; await navigator.clipboard.writeText(snapshot.links?.collaboratorInviteUrl ?? snapshot.links?.pmInviteUrl ?? active.inviteUrl); status("Invite copied. Your collaborator only needs the link."); };

const profileDialog = byId("profile-dialog");
byId("profile-button").onclick = () => {
  byId("profile-name").value = person().name;
  profileDialog.showModal();
  byId("profile-name").select();
};

const decisionDialog = byId("decision-dialog");
byId("propose-decision").onclick = () => {
  const decision = snapshot?.decision ?? {};
  byId("decision-proposal").value = decision.proposal ?? "";
  byId("decision-rationale").value = decision.rationale ?? "";
  byId("decision-next-step").value = decision.nextStep ?? "";
  decisionDialog.showModal();
  byId("decision-proposal").focus();
};
byId("close-decision").onclick = () => decisionDialog.close();
byId("decision-form").onsubmit = async (event) => {
  event.preventDefault();
  const proposal = byId("decision-proposal").value.trim();
  if (!proposal) return byId("decision-proposal").focus();
  const author = person();
  try {
    render(await json(await fetch(`/v1/sessions/${active.id}/decision/propose`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        actor: author.name,
        actorId: author.id,
        proposal,
        rationale: byId("decision-rationale").value,
        nextStep: byId("decision-next-step").value,
      }),
    })));
    decisionDialog.close();
    status("Outcome proposed. Waiting for the other person to agree.");
  } catch (error) { status(error.message); }
};
byId("approve-decision").onclick = async () => {
  const author = person();
  try {
    render(await json(await fetch(`/v1/sessions/${active.id}/decision/approve`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ actor: author.name, actorId: author.id, approved: true }),
    })));
    const settled = snapshot.decision?.status === "decided";
    status(settled ? "Decision agreed by both people. It will be included in the next checkpoint." : "Agreement saved. Waiting for the other person.");
  } catch (error) { status(error.message); }
};
byId("close-profile").onclick = () => profileDialog.close();
byId("profile-form").onsubmit = async (event) => {
  event.preventDefault();
  const name = byId("profile-name").value.trim();
  if (!name) return;
  localStorage.setItem(profileKey(), name);
  profileDialog.close();
  if (active) {
    render(await json(await fetch(`/v1/sessions/${active.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) })));
    status(`Connected as ${name}.`);
  }
};

const dialog = byId("session-dialog");
function setSessionAction() {
  const titleReady = Boolean(byId("session-title").value.trim());
  byId("create-session").disabled = !titleReady;
  byId("create-session").textContent = selectedWorkspace
    ? `Start with PR #${selectedWorkspace.prNumber}`
    : "Start shared session";
}
function renderWorkspaceOptions() {
  if (!discoveredWorkspaces?.length) {
    byId("workspace-results").innerHTML = "";
    return;
  }
  const words = byId("session-title").value.toLowerCase().split(/\W+/).filter((word) => word.length > 2);
  const options = discoveredWorkspaces
    .map((pr) => ({ name: pr.repository.name, prNumber: pr.number, title: pr.title, branch: pr.branches?.source, score: words.filter((word) => `${pr.title} ${pr.repository.name}`.toLowerCase().includes(word)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  byId("workspace-results").innerHTML = options.map((item, index) => {
    const selected = selectedWorkspace?.name === item.name && selectedWorkspace?.prNumber === item.prNumber;
    return `<button type="button" class="workspace-option${selected ? " selected" : ""}" data-workspace="${index}"><b>${esc(item.title)}</b><small>${esc(item.name)} · PR #${item.prNumber}</small>${selected ? "<em>Selected</em>" : ""}</button>`;
  }).join("");
  for (const button of document.querySelectorAll("[data-workspace]")) button.onclick = () => {
    const item = options[Number(button.dataset.workspace)];
    selectedWorkspace = selectedWorkspace?.name === item.name && selectedWorkspace?.prNumber === item.prNumber ? null : item;
    renderWorkspaceOptions();
    setSessionAction();
  };
}
async function discoverWorkspaces() {
  byId("repo-search-state").textContent = "Searching…";
  try {
    if (!discoveredWorkspaces) {
      const data = await json(await fetch("/v1/integrations/greptile/pull-requests?limit=50", { signal: AbortSignal.timeout(8_500) }));
      discoveredWorkspaces = data.result?.mergeRequests ?? [];
    }
    byId("repo-search-state").textContent = discoveredWorkspaces.length ? `${discoveredWorkspaces.length} found` : "None linked";
    renderWorkspaceOptions();
  } catch {
    discoveredWorkspaces = [];
    byId("workspace-results").innerHTML = "";
    byId("repo-search-state").textContent = "Connect later";
  }
}
async function createSession(repository) {
  const target = repository ?? { name: "Local workspace", remote: "local", defaultBranch: "", prNumber: null };
  const mode = repository ? "build" : "decision";
  const created = await json(await fetch("/v1/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    title: byId("session-title").value,
    mode,
    creatorRole: mode === "build" ? "swe" : "host",
    creatorName: localStorage.getItem("relay.profile.swe") || "Host",
    collaboratorName: "Partner",
    repository: target,
  }) }));
  history.replaceState(null, "", new URL(created.creatorUrl).hash); dialog.close();
  try { await connect(fromHash()); }
  catch { location.assign(created.creatorUrl); }
}
byId("new-session").onclick = () => {
  selectedWorkspace = null;
  byId("session-title").value = "";
  byId("session-error").textContent = "";
  byId("workspace-results").innerHTML = "";
  byId("repo-search-state").textContent = "Optional";
  setSessionAction();
  dialog.showModal();
  byId("session-title").focus();
  discoverWorkspaces();
};
byId("close-sheet").onclick = () => dialog.close();
byId("session-title").oninput = () => { renderWorkspaceOptions(); setSessionAction(); };
byId("session-title").onkeydown = (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  byId("session-form").requestSubmit();
};
byId("session-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!byId("session-title").value.trim()) return byId("session-title").focus();
  byId("create-session").disabled = true;
  byId("create-session").textContent = "Starting…";
  try { await createSession(selectedWorkspace); }
  catch (e) { byId("session-error").textContent = e.message; setSessionAction(); }
};
window.addEventListener("hashchange", () => { const next = fromHash(); if (next && next.id !== active?.id) connect(next).catch((e) => status(e.message)); });

try { const [health, memory] = await Promise.all([json(await fetch("/health")), json(await fetch("/v1/integrations/claude-mem/status")).catch(() => ({ connected: false }))]); claudeMemReady = memory.connected; byId("sail-pill").textContent = health.workPod.provider === "sail" ? "Sail · ready" : "Local · ready"; byId("memory-pill").textContent = memory.connected ? "Claude-Mem · listening" : "Claude-Mem · optional"; } catch { status("Relay is offline."); }
renderSessions(); const initial = fromHash(); if (initial) connect(initial).catch((e) => { status(e.message); dialog.showModal(); discoverWorkspaces(); }); else { dialog.showModal(); discoverWorkspaces(); }
setInterval(() => {
  const elapsed = byId("live-elapsed");
  if (!elapsed || !liveAgentStartedAt) return;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(liveAgentStartedAt).getTime()) / 1000));
  elapsed.textContent = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (byId("coordination-detail")?.textContent.startsWith("Live host execution")) byId("coordination-detail").textContent = `Live host execution · ${elapsed.textContent} · next role waits in queue`;
  const heartbeat = byId("trace-heartbeat");
  if (heartbeat) heartbeat.textContent = `Model connected · ${elapsed.textContent} · waiting for the next thinking, tool, or text event`;
}, 1000);
