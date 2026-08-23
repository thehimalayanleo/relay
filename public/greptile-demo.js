const byId = (id) => document.getElementById(id);
const RECENTS_KEY = "relay.sessions.v1";
let active, snapshot, stream, presenceTimer, memoryTimer, memoryContext;
let claudeMemReady = false;
let selectedWorkspace = null;
let discoveredWorkspaces = null;
const syncedSessions = new Set();

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const cleanLabel = (value) => String(value ?? "Agent").replace(/^\*\*|\*\*$/g, "").replace(/^\\+|\\+$/g, "").trim();
async function json(response) { const body = await response.json(); if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`); return body; }
const authHeaders = (extra = {}) => ({ authorization: `Bearer ${active.token}`, ...extra });
function fromHash() { const p = new URLSearchParams(location.hash.slice(1)); const role = ["pm", "collaborator"].includes(p.get("role")) ? p.get("role") : "swe"; return p.get("session") && p.get("token") ? { id: p.get("session"), token: p.get("token"), role } : null; }
function person() { return ["pm", "collaborator"].includes(active.role) ? { id: `sanjana-swe-${active.id}`, name: "Sanjana", role: "SWE", color: "#ff5a1f" } : { id: `ajinkya-swe-${active.id}`, name: "Ajinkya", role: "SWE", color: "#7aa2f7" }; }
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

function renderSessions() {
  const list = recents();
  byId("sessions").innerHTML = list.length ? list.map((x) => `<button class="session-item ${x.id === active?.id ? "active" : ""}" data-session="${esc(x.id)}">${esc(x.title)}</button>`).join("") : '<span style="padding:8px 10px;color:#666;font-size:12px">No sessions yet</span>';
  for (const button of document.querySelectorAll("[data-session]")) button.onclick = () => { const next = list.find((x) => x.id === button.dataset.session); history.replaceState(null, "", `#session=${encodeURIComponent(next.id)}&token=${encodeURIComponent(next.token)}&role=${next.role}`); connect(next).catch((e) => status(e.message)); };
}

function renderFeed() {
  const exactRuns = (snapshot.agentRuns ?? []).filter((run) => run.exitCode === 0 && run.inheritedContext && run.response && run.response !== "OpenCode completed with no text response.");
  const latestByParticipant = new Map();
  for (const run of exactRuns) latestByParticipant.set(cleanLabel(run.requestedBy), run);
  const runs = [...latestByParticipant.values()].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  const collaboratorEdit = [...(snapshot.activity ?? [])].reverse().find((event) => ["chat", "edit"].includes(event.type) && event.actor === "Sanjana");
  const editHtml = collaboratorEdit ? `<article class="event"><div class="avatar">S</div><div class="bubble"><strong>Sanjana · SWE</strong><time>${new Date(collaboratorEdit.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span class="inherited">Added to the shared agent stack</span><div class="agent-response">${esc(collaboratorEdit.value || collaboratorEdit.detail || snapshot.brief.implementation)}</div></div></article>` : "";
  if (runs.length) {
    byId("feed").innerHTML = editHtml + runs.map((run) => {
      const participant = cleanLabel(run.requestedBy);
      const inherited = `Inherited: ${run.inheritedContext.problem} Constraint: ${run.inheritedContext.constraint} Next: ${run.inheritedContext.nextAction}`;
      return `<article class="event"><div class="avatar">${esc(participant[0])}</div><div class="bubble"><strong>${esc(participant)}</strong><time>${new Date(run.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span class="inherited">${esc(inherited)}</span><div class="agent-response">${esc(run.response)}</div></div></article>`;
    }).join("");
    return;
  }
  if (editHtml) { byId("feed").innerHTML = editHtml; return; }
  const event = snapshot.activity?.at(-1);
  byId("feed").innerHTML = event ? `<article class="event"><div class="avatar">${esc((event.actor || "R")[0])}</div><div class="bubble"><strong>${esc(event.actor || "Relay")}</strong><p>${esc(event.detail)}</p></div></article>` : "";
}

function renderGreptile() {
  const samples = snapshot.greptile?.samples ?? [];
  const latest = samples.at(-1) ?? { closed: 0, remaining: 0 };
  byId("greptile-addressed").textContent = latest.closed ?? 0;
  byId("greptile-open").textContent = latest.remaining ?? 0;
  byId("greptile-note").textContent = !snapshot.repository.prNumber ? "No pull request linked" : samples.length ? `Review ${latest.iteration}` : "Waiting for first review";
  const max = Math.max(1, ...samples.flatMap((sample) => [sample.closed, sample.remaining]));
  byId("greptile-spark").innerHTML = samples.length ? samples.map((sample) => `<span class="spark-sample" title="${sample.closed} addressed, ${sample.remaining} open"><i style="height:${Math.max(2, sample.closed / max * 100)}%"></i><i class="open" style="height:${Math.max(2, sample.remaining / max * 100)}%"></i></span>`).join("") : '<span style="color:#666;font-size:10px;padding-bottom:7px">No Greptile samples yet</span>';
}

function render(next) {
  snapshot = { ...next, links: next.links ?? snapshot?.links, hostIntegrations: next.hostIntegrations ?? snapshot?.hostIntegrations };
  byId("session-title-view").textContent = snapshot.title;
  byId("session-subtitle").textContent = `${snapshot.repository.name}${snapshot.repository.prNumber ? ` · PR #${snapshot.repository.prNumber}` : " · new repository"} · v${snapshot.version}`;
  byId("presence").innerHTML = snapshot.participants.map((p) => `<div class="avatar" style="background:${esc(p.color)}" title="${esc(p.name)} · ${esc(p.role)}">${esc(p.name[0])}</div>`).join("");
  if (!byId("composer").dataset.ready) { byId("composer").value = ""; byId("composer").dataset.ready = "true"; }
  const runs = snapshot.agentRuns ?? [];
  const latestRun = runs.filter((run) => run.exitCode === 0 && run.response && run.response !== "OpenCode completed with no text response.").at(-1);
  byId("coordination-state").textContent = latestRun ? "1 agent continuation · 1 Sailbox" : "One serialized agent queue";
  byId("coordination-detail").textContent = latestRun ? "Latest shared-stack continuation, preserved word for word" : `${snapshot.checkpoints.length} checkpoint${snapshot.checkpoints.length === 1 ? "" : "s"} · ready on host`;
  byId("host-mode").textContent = ["pm", "collaborator"].includes(active.role) ? "Connected as Sanjana · SWE" : "Host integrations ready";
  byId("host-help").textContent = ["pm", "collaborator"].includes(active.role) ? "No local keys required" : "Powered by host integrations";
  const latestGreptile = snapshot.greptile?.samples?.at(-1) ?? { closed: 0, remaining: 0 };
  byId("greptile-pill").textContent = snapshot.repository.prNumber ? `Greptile · ${latestGreptile.closed} addressed · ${latestGreptile.remaining} open` : "Greptile · waiting for PR";
  renderFeed(); renderGreptile(); remember();
  clearTimeout(memoryTimer); memoryTimer = setTimeout(recallMemory, 900);
}

async function connect(session) {
  stream?.close(); clearInterval(presenceTimer); active = session;
  render(await json(await fetch(`/v1/sessions/${active.id}`, { headers: authHeaders() })));
  active.inviteUrl = snapshot.links?.pmInviteUrl;
  await json(await fetch(`/v1/sessions/${active.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) }));
  presenceTimer = setInterval(() => fetch(`/v1/sessions/${active.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) }).catch(() => {}), 15000);
  stream = new EventSource(`/v1/sessions/${active.id}/events?token=${encodeURIComponent(active.token)}`);
  for (const name of ["workspace", "presence", "activity", "memory", "checkpoint", "greptile", "agent-queue"]) stream.addEventListener(name, (event) => render(JSON.parse(event.data)));
  stream.onerror = () => status("Reconnecting to the shared workspace…");
  status(["pm", "collaborator"].includes(active.role) ? "You are in Ajinkya’s live workspace. No setup required." : `Session ready · invite expires ${new Date(snapshot.expiresAt).toLocaleString()}`);
  if (snapshot.repository.prNumber && !syncedSessions.has(active.id)) {
    syncedSessions.add(active.id);
    fetch(`/v1/sessions/${active.id}/greptile/sync`, { method: "POST", headers: authHeaders() }).then(json).then((metrics) => status(`Greptile · ${metrics.totals.closed} addressed · ${metrics.totals.remaining} open`)).catch(() => { byId("greptile-pill").textContent = "Greptile · PR not indexed"; });
  }
}

async function updateField(field, value) {
  if (!active) return;
  render(await json(await fetch(`/v1/sessions/${active.id}/brief`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ ...person(), actor: person().name, actorId: person().id, field, value }) })));
}
byId("send").onclick = async () => {
  const value = byId("composer").value.trim();
  if (!value) return;
  byId("send").disabled = true;
  try {
    await updateField("implementation", value);
    await json(await fetch(`/v1/sessions/${active.id}/activity`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ type: "chat", actor: person().name, detail: value, value }) }));
    byId("composer").value = "";
    status("Added to the shared agent stack.");
  } catch (error) { status(error.message); }
  finally { byId("send").disabled = false; }
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

byId("invite-session").onclick = async () => { if (!snapshot) return; await navigator.clipboard.writeText(snapshot.links?.collaboratorInviteUrl ?? snapshot.links?.pmInviteUrl ?? active.inviteUrl); status("Invite copied. Sanjana only needs the link."); };
byId("preview-session").onclick = () => snapshot && window.open(snapshot.links?.collaboratorInviteUrl ?? snapshot.links?.pmInviteUrl ?? active.inviteUrl, "relay-swe-preview");

const dialog = byId("session-dialog");
async function discoverWorkspaces() {
  if (!discoveredWorkspaces) byId("workspace-results").innerHTML = '<span style="color:#777;font-size:12px">Searching the host’s active work…</span>';
  try {
    if (!discoveredWorkspaces) {
      const data = await json(await fetch("/v1/integrations/greptile/pull-requests?limit=50"));
      discoveredWorkspaces = data.result?.mergeRequests ?? [];
    }
    const words = byId("session-title").value.toLowerCase().split(/\W+/).filter((word) => word.length > 2);
    const options = discoveredWorkspaces.map((pr) => ({ name: pr.repository.name, prNumber: pr.number, title: pr.title, branch: pr.branches?.source, score: words.filter((word) => `${pr.title} ${pr.repository.name}`.toLowerCase().includes(word)).length })).sort((a, b) => b.score - a.score).slice(0, 8);
    byId("workspace-results").innerHTML = options.length ? options.map((item, index) => `<label class="workspace-option"><input type="radio" name="workspace" value="${index}"><b>${esc(item.title)}</b><small>${esc(item.name)} · PR #${item.prNumber}</small></label>`).join("") : '<span style="color:#777;font-size:12px">No active pull requests found. Start a clean repository below.</span>';
    for (const input of document.querySelectorAll('input[name="workspace"]')) input.onchange = () => { selectedWorkspace = options[Number(input.value)]; byId("create-session").disabled = false; };
  } catch (error) { byId("workspace-results").innerHTML = `<span style="color:#888;font-size:12px">${esc(error.message)}. You can start a clean repository instead.</span>`; }
}
async function createSession(repository) {
  const created = await json(await fetch("/v1/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: byId("session-title").value, creatorRole: "swe", repository: { ...repository, remote: "github", defaultBranch: repository.defaultBranch ?? "main" } }) }));
  history.replaceState(null, "", new URL(created.creatorUrl).hash); dialog.close(); await connect(fromHash());
}
byId("new-session").onclick = () => { selectedWorkspace = null; byId("create-session").disabled = true; dialog.showModal(); discoverWorkspaces(); }; byId("close-sheet").onclick = () => dialog.close();
let discoveryTimer; byId("session-title").oninput = () => { clearTimeout(discoveryTimer); discoveryTimer = setTimeout(discoverWorkspaces, 350); };
byId("create-repo").onclick = async () => { const title = byId("session-title").value.trim(); if (!title) return byId("session-title").focus(); const name = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "relay-workspace"; byId("create-repo").disabled = true; try { const repo = await json(await fetch("/v1/integrations/github/repositories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: title }) })); await createSession({ name: repo.name, prNumber: null, defaultBranch: repo.defaultBranch }); } catch (e) { byId("session-error").textContent = e.message; } finally { byId("create-repo").disabled = false; } };
byId("session-form").onsubmit = async (event) => { event.preventDefault(); if (!selectedWorkspace) return; byId("create-session").disabled = true; try { await createSession(selectedWorkspace); } catch (e) { byId("session-error").textContent = e.message; } finally { byId("create-session").disabled = false; } };
window.addEventListener("hashchange", () => { const next = fromHash(); if (next && next.id !== active?.id) connect(next).catch((e) => status(e.message)); });

try { const [health, memory] = await Promise.all([json(await fetch("/health")), json(await fetch("/v1/integrations/claude-mem/status")).catch(() => ({ connected: false }))]); claudeMemReady = memory.connected; byId("sail-pill").textContent = health.workPod.provider === "sail" ? "Sail · ready" : "Local · ready"; byId("memory-pill").textContent = memory.connected ? "Claude-Mem · listening" : "Claude-Mem · optional"; } catch { status("Relay is offline."); }
renderSessions(); const initial = fromHash(); if (initial) connect(initial).catch((e) => { status(e.message); dialog.showModal(); discoverWorkspaces(); }); else { dialog.showModal(); discoverWorkspaces(); }
