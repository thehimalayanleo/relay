const byId = (id) => document.getElementById(id);
const RECENTS_KEY = "relay.sessions.v1";
let active, snapshot, stream, presenceTimer, memoryTimer, memoryContext;
let claudeMemReady = false;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
async function json(response) { const body = await response.json(); if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`); return body; }
const authHeaders = (extra = {}) => ({ authorization: `Bearer ${active.token}`, ...extra });
function fromHash() { const p = new URLSearchParams(location.hash.slice(1)); return p.get("session") && p.get("token") ? { id: p.get("session"), token: p.get("token"), role: p.get("role") === "pm" ? "pm" : "swe" } : null; }
function person() { return active.role === "pm" ? { id: `sanjana-pm-${active.id}`, name: "Sanjana", role: "Product Manager", color: "#ff5a1f" } : { id: `ajinkya-swe-${active.id}`, name: "Ajinkya", role: "SWE", color: "#7aa2f7" }; }
function recents() { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; } }
function remember() { const item = { ...active, title: snapshot.title, lastOpenedAt: new Date().toISOString() }; localStorage.setItem(RECENTS_KEY, JSON.stringify([item, ...recents().filter((x) => x.id !== item.id)].slice(0, 12))); renderSessions(); }
const status = (message) => { byId("truth").textContent = message; };

function renderSessions() {
  const list = recents();
  byId("sessions").innerHTML = list.length ? list.map((x) => `<button class="session-item ${x.id === active?.id ? "active" : ""}" data-session="${esc(x.id)}">${esc(x.title)}</button>`).join("") : '<span style="padding:8px 10px;color:#666;font-size:12px">No sessions yet</span>';
  for (const button of document.querySelectorAll("[data-session]")) button.onclick = () => { const next = list.find((x) => x.id === button.dataset.session); history.replaceState(null, "", `#session=${encodeURIComponent(next.id)}&token=${encodeURIComponent(next.token)}&role=${next.role}`); connect(next).catch((e) => status(e.message)); };
}

function renderFeed() {
  const exactRuns = (snapshot.agentRuns ?? []).filter((run) => run.exitCode === 0 && run.response && run.response !== "OpenCode completed with no text response.");
  const runs = exactRuns.length ? exactRuns.slice(-2) : (snapshot.agentRuns ?? []).slice(-2);
  if (runs.length) {
    byId("feed").innerHTML = runs.map((run) => {
      const inherited = run.inheritedContext ? `Inherited: ${run.inheritedContext.problem} Constraint: ${run.inheritedContext.constraint} Next: ${run.inheritedContext.nextAction}` : "This legacy run did not retain its prompt text.";
      const response = run.response || "This legacy run completed successfully, but its exact response was not retained. New runs preserve the full wording here.";
      return `<article class="event"><div class="avatar">${esc((run.requestedBy || "A")[0])}</div><div class="bubble"><strong>${esc(run.requestedBy || "Agent")}</strong><time>${new Date(run.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span class="inherited">${esc(inherited)}</span><div class="agent-response">${esc(response)}</div></div></article>`;
    }).join("");
    return;
  }
  const event = snapshot.activity?.at(-1);
  byId("feed").innerHTML = event ? `<article class="event"><div class="avatar">${esc((event.actor || "R")[0])}</div><div class="bubble"><strong>${esc(event.actor || "Relay")}</strong><p>${esc(event.detail)}</p></div></article>` : "";
}

function render(next) {
  snapshot = { ...next, links: next.links ?? snapshot?.links, hostIntegrations: next.hostIntegrations ?? snapshot?.hostIntegrations };
  byId("session-title-view").textContent = snapshot.title;
  byId("session-subtitle").textContent = `${snapshot.repository.name} · PR #${snapshot.repository.prNumber} · v${snapshot.version}`;
  byId("presence").innerHTML = snapshot.participants.map((p) => `<div class="avatar" style="background:${esc(p.color)}" title="${esc(p.name)} · ${esc(p.role)}">${esc(p.name[0])}</div>`).join("");
  if (document.activeElement !== byId("composer")) byId("composer").value = snapshot.brief.implementation ?? "";
  const runs = snapshot.agentRuns ?? [];
  const exactRuns = runs.filter((run) => run.exitCode === 0 && run.response && run.response !== "OpenCode completed with no text response.").slice(-2);
  const boxes = [...new Set(exactRuns.map((run) => run.sailboxId).filter(Boolean))];
  byId("coordination-state").textContent = exactRuns.length ? `${exactRuns.length} agent responses · ${boxes.length || 1} Sailbox` : "One serialized agent queue";
  byId("coordination-detail").textContent = exactRuns.length ? "Latest Ajinkya + Sanjana handoff, preserved word for word" : `${snapshot.checkpoints.length} checkpoint${snapshot.checkpoints.length === 1 ? "" : "s"} · ready on host`;
  byId("host-mode").textContent = active.role === "pm" ? "Connected as Sanjana" : "Host integrations ready";
  byId("host-help").textContent = active.role === "pm" ? "No local keys required" : "Powered by host integrations";
  renderFeed(); remember();
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
  status(active.role === "pm" ? "You are in Ajinkya’s live workspace. No setup required." : `Session ready · invite expires ${new Date(snapshot.expiresAt).toLocaleString()}`);
}

async function updateField(field, value) {
  if (!active) return;
  render(await json(await fetch(`/v1/sessions/${active.id}/brief`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ ...person(), actor: person().name, actorId: person().id, field, value }) })));
}
byId("send").onclick = () => updateField("implementation", byId("composer").value).then(() => status("Shared with the workspace.")).catch((e) => status(e.message));

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

byId("invite-session").onclick = async () => { if (!snapshot) return; await navigator.clipboard.writeText(snapshot.links?.pmInviteUrl ?? active.inviteUrl); status("Invite copied. Sanjana only needs the link."); };
byId("preview-session").onclick = () => snapshot && window.open(snapshot.links?.pmInviteUrl ?? active.inviteUrl, "relay-pm-preview");

const dialog = byId("session-dialog");
byId("new-session").onclick = () => dialog.showModal(); byId("close-sheet").onclick = () => dialog.close();
byId("session-form").onsubmit = async (event) => { event.preventDefault(); byId("create-session").disabled = true; try { const created = await json(await fetch("/v1/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: byId("session-title").value, creatorRole: "swe", repository: { name: byId("session-repo").value, prNumber: Number(byId("session-pr").value), remote: "github", defaultBranch: "main" } }) })); history.replaceState(null, "", new URL(created.creatorUrl).hash); dialog.close(); await connect(fromHash()); } catch (e) { byId("session-error").textContent = e.message; } finally { byId("create-session").disabled = false; } };
window.addEventListener("hashchange", () => { const next = fromHash(); if (next && next.id !== active?.id) connect(next).catch((e) => status(e.message)); });

try { const [health, memory] = await Promise.all([json(await fetch("/health")), json(await fetch("/v1/integrations/claude-mem/status")).catch(() => ({ connected: false }))]); claudeMemReady = memory.connected; byId("sail-pill").textContent = health.workPod.provider === "sail" ? "Sail · ready" : "Local · ready"; byId("memory-pill").textContent = memory.connected ? "Claude-Mem · listening" : "Claude-Mem · optional"; } catch { status("Relay is offline."); }
renderSessions(); const initial = fromHash(); if (initial) connect(initial).catch((e) => { status(e.message); dialog.showModal(); }); else dialog.showModal();
