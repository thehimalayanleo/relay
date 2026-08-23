const byId = (id) => document.getElementById(id);
const RECENTS_KEY = "relay.sessions.v1";
let active, snapshot, stream, transfer, editTimer, claudeMemContext, syncTimer, lastMemoryKey, presenceTimer;
let claudeMemReady = false;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
async function json(response) { const body = await response.json(); if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`); return body; }
const authHeaders = (extra = {}) => ({ authorization: `Bearer ${active.token}`, ...extra });
function hashSession() { const p = new URLSearchParams(location.hash.slice(1)); return p.get("session") && p.get("token") ? { id: p.get("session"), token: p.get("token"), role: p.get("role") === "pm" ? "pm" : "swe" } : null; }
function person(role = active?.role ?? "swe") { return role === "pm" ? { id: `sanjana-pm-${active.id}`, name: "Sanjana", role: "Product Manager", color: "#ff5a1f" } : { id: `ajinkya-swe-${active.id}`, name: "Ajinkya", role: "SWE", color: "#7aa2f7" }; }
function recents() { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); } catch { return []; } }
function saveRecent() { const item = { ...active, title: snapshot.title, lastOpenedAt: new Date().toISOString() }; localStorage.setItem(RECENTS_KEY, JSON.stringify([item, ...recents().filter((e) => e.id !== item.id)].slice(0, 12))); renderSwitcher(); }
const setStatus = (message) => { byId("truth").textContent = message; };
function addLog(text, kind = "ok") { const line = document.createElement("div"); line.className = `log-line ${kind}`; line.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span>${escapeHtml(text)}</span>`; byId("log").append(line); byId("log").scrollTop = byId("log").scrollHeight; }

const controls = document.createElement("div");
controls.className = "session-controls";
controls.innerHTML = '<select id="session-switch" aria-label="Recent Relay sessions"></select><button id="new-session">New session</button><button id="invite-session">Copy invite link</button><button id="preview-session">Preview as Sanjana</button>';
document.querySelector(".topbar").insertBefore(controls, document.querySelector(".runstate"));
const modal = document.createElement("dialog");
modal.innerHTML = '<form id="session-form"><div class="sheet-head"><strong>New Relay session</strong><button type="button" id="close-sheet" aria-label="Close">×</button></div><label>What are you shipping?<input id="session-title" maxlength="200" required placeholder="Fix checkout retries without rediscovery"></label><label>Greptile-indexed repository<input id="session-repo" required placeholder="owner/repository"></label><label>Open pull request<input id="session-pr" required type="number" min="1" placeholder="42"></label><button id="create-session" class="primary">Create shared session</button><p id="session-error"></p></form>';
document.body.append(modal);
const style = document.createElement("style");
style.textContent = `.app{grid-template-rows:42px 30px minmax(0,1fr) 22px}.session-controls{display:flex;gap:6px;align-items:center;margin-left:auto;margin-right:16px}.session-controls select,.session-controls button{height:30px;border:1px solid #353638;background:#18191a;color:#dedede;border-radius:6px;padding:0 10px;font:600 11px Inter,sans-serif}.session-controls button:first-of-type{background:var(--orange);border-color:var(--orange);color:#111}dialog{border:1px solid #3c3d3f;border-radius:12px;background:#151617;color:#eee;width:min(430px,calc(100vw - 32px));padding:0;box-shadow:0 24px 90px #000b}dialog::backdrop{background:#080808b8;backdrop-filter:blur(4px)}#session-form{padding:20px;display:grid;gap:15px}.sheet-head{display:flex;justify-content:space-between;align-items:center;font-size:18px}.sheet-head button{border:0;background:none;color:#aaa;font-size:24px}#session-form label{display:grid;gap:6px;color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:.08em}#session-form input{height:40px;border:1px solid #393a3c;background:#0f1011;color:#eee;border-radius:7px;padding:0 11px;font:14px Inter,sans-serif}#session-form .primary{height:44px;border:0;border-radius:7px;background:var(--orange);font-weight:800}#session-error{min-height:16px;color:#ff876f;margin:0}.metric-plot{height:116px;display:flex;align-items:flex-end;gap:7px;padding:12px 12px 4px}.metric-sample{flex:1;min-width:6px;display:grid;grid-template-columns:1fr 1fr;gap:2px;align-items:end;height:100%}.metric-sample i{display:block;min-height:2px;background:var(--orange);border-radius:2px 2px 0 0}.metric-sample i.remaining{background:#55585e}.finding-list{max-height:104px;overflow:auto;font-size:10px;color:#aaa;padding:0 12px}.finding-list a{color:#ddd;text-decoration:none}.finding-list div{padding:5px 0;border-top:1px solid #2a2b2d}.finding-list b{color:var(--orange);margin-right:6px}.memory-pill{color:var(--green);font-size:10px}.editor pre{white-space:pre-wrap}@media(max-width:960px){.shell{grid-template-columns:1fr}.sidebar,.editor{display:none}.inspector{display:block}.session-controls select,#preview-session{display:none}}`;
document.head.append(style);
const hostBanner = document.createElement("div");
hostBanner.id = "host-banner";
hostBanner.style.cssText = "padding:7px 14px;border-bottom:1px solid #292a2c;background:#101112;color:#aaa;font:600 11px Inter,sans-serif;display:flex;justify-content:space-between";
hostBanner.innerHTML = '<span id="host-mode">Host integrations: checking</span><span id="invite-expiry"></span>';
document.querySelector(".topbar").after(hostBanner);

const liveRoom = byId("live-room");
liveRoom.innerHTML = '<div class="live-head"><strong>One shared brief</strong><small><span class="pulse"></span>LIVE</small><span id="memory-state" class="memory-pill">Claude-Mem · checking</span></div><div class="presence" id="presence"></div><div class="live-fields"><label>Customer problem<textarea data-field="problem"></textarea></label><label>PM constraint<textarea data-field="constraint"></textarea></label><label>Acceptance criteria<textarea data-field="acceptance"></textarea></label><label>Next implementation step<textarea data-field="implementation"></textarea></label></div><div class="live-foot"><span id="room-role"></span><span id="room-version">v0</span></div>';
document.querySelector(".plot").innerHTML = '<div class="plot-title"><strong>Greptile findings closed</strong><span class="legend"><i class="key"></i> Closed <i class="key blocked"></i> Remaining</span></div><div id="metric-plot" class="metric-plot"></div><div id="finding-list" class="finding-list"></div>';
document.querySelector(".run-card strong").textContent = "Shared agent workspace";
document.querySelector(".run-card p").textContent = "One brief. Two collaborators. One serialized agent queue.";
document.querySelector(".sidehead").textContent = "Session evidence";
document.querySelectorAll(".file").forEach((file, i) => { file.textContent = ["shared-brief.md", "greptile-findings.json", "claude-mem.refs", "agent-queue.log", "checkpoints/", "SESSION.json", "CAMP.json", "HANDOFF.md"][i] ?? file.textContent; });
document.querySelector(".editor pre").textContent = "Relay is waiting for a shared session.\n\nCreate one, invite your PM, and work from the same live brief.";
[["bug-count", "Findings closed"], ["test-count", "Remaining"], ["action-count", "Brief version"], ["budget-count", "Checkpoints"]].forEach(([id, label]) => { byId(id).nextElementSibling.textContent = label; });
byId("log").innerHTML = '<div class="log-line"><time>now</time><span>Create or join a session to begin the shared timeline.</span></div>';
byId("relay").textContent = "Seal checkpoint on host"; byId("agent").textContent = "Run next action on host"; byId("resume").textContent = "Open checkpoint"; byId("review").textContent = "Sync Greptile on host";
const twoAgents = document.createElement("button");
twoAgents.id = "two-agents";
twoAgents.textContent = "Run Ajinkya + Sanjana";
twoAgents.disabled = true;
document.querySelector(".controls").append(twoAgents);
const coordination = document.createElement("section");
coordination.id = "coordination-proof";
coordination.style.cssText = "margin:12px;padding:12px;border:1px solid var(--line);border-radius:8px;background:#101112";
coordination.innerHTML = '<div style="display:flex;justify-content:space-between"><strong>One Sailbox coordination</strong><span id="coordination-state" style="color:var(--muted);font-size:10px">No runs yet</span></div><div id="coordination-runs" style="margin-top:8px;color:var(--muted);font-size:10px"></div>';
document.querySelector(".controls").after(coordination);

function renderSwitcher() { const select = byId("session-switch"); const list = recents(); select.innerHTML = list.length ? list.map((e) => `<option value="${escapeHtml(e.id)}" ${e.id === active?.id ? "selected" : ""}>${escapeHtml(e.title)}</option>`).join("") : '<option>No recent sessions</option>'; }
function renderMetrics(g = snapshot?.greptile) {
  const samples = g?.samples ?? [], findings = Object.values(g?.findings ?? {}), latest = samples.at(-1) ?? { closed: 0, remaining: findings.filter((x) => x.state === "open").length, unknown: 0 };
  byId("bug-count").textContent = latest.closed ?? 0; byId("test-count").textContent = latest.remaining ?? 0;
  const max = Math.max(1, ...samples.flatMap((s) => [s.closed, s.remaining]));
  byId("metric-plot").innerHTML = samples.length ? samples.map((s) => `<span class="metric-sample" title="Review ${s.iteration}: ${s.closed} closed, ${s.remaining} remaining, ${s.unknown} unknown"><i style="height:${Math.max(2, s.closed / max * 100)}%"></i><i class="remaining" style="height:${Math.max(2, s.remaining / max * 100)}%"></i></span>`).join("") : '<span style="color:#777;font-size:11px;align-self:center">Sync Greptile to begin this session’s timeline.</span>';
  byId("finding-list").innerHTML = findings.map((f) => `<div><b>${escapeHtml(f.state)}</b>${f.url ? `<a href="${escapeHtml(f.url)}" target="_blank">${escapeHtml(f.id)}</a>` : escapeHtml(f.id)} ${escapeHtml(f.path)}${f.closedAt ? ` · closed ${new Date(f.closedAt).toLocaleTimeString()}` : ""}</div>`).join("");
}
function render(next) {
  const oldEvent = snapshot?.activity?.at(-1)?.id; snapshot = { ...next, links: next.links ?? snapshot?.links, hostIntegrations: next.hostIntegrations ?? snapshot?.hostIntegrations };
  byId("room-version").textContent = `v${next.version}`; byId("action-count").textContent = next.version; byId("budget-count").textContent = next.checkpoints.length; byId("room-role").textContent = `You are ${person().name} · ${person().role}`;
  byId("two-agents").disabled = next.checkpoints.length === 0;
  byId("presence").innerHTML = next.participants.map((p) => `<div class="avatar" style="background:${escapeHtml(p.color)}">${escapeHtml(p.name[0])}</div><span>${escapeHtml(p.name)}${p.activeField ? ` is editing ${escapeHtml(p.activeField)}…` : ` · ${escapeHtml(p.role)}`}</span>`).join("");
  for (const area of liveRoom.querySelectorAll("textarea")) if (document.activeElement !== area) area.value = next.brief[area.dataset.field] ?? "";
  document.querySelector(".editor pre").textContent = `# ${next.title}\n\nRepository: ${next.repository.name}\nPull request: #${next.repository.prNumber}\nShared brief: v${next.version}\n\nProblem\n${next.brief.problem}\n\nNext action\n${next.brief.implementation}\n\nAgent execution: serialized`;
  document.querySelector(".run-card strong").textContent = next.title; document.querySelector(".run-card p").textContent = `${next.repository.name} · PR #${next.repository.prNumber}`; renderMetrics();
  const runs = snapshot.agentRuns ?? [];
  const sailboxes = [...new Set(runs.map((run) => run.sailboxId).filter(Boolean))];
  byId("coordination-state").textContent = runs.length ? `${runs.length} OpenCode sessions · ${sailboxes.length} Sailbox` : "No runs yet";
  byId("coordination-runs").innerHTML = runs.map((run, index) => `<div style="padding:5px 0;border-top:1px solid #292a2c"><b style="color:var(--orange)">${index + 1}. ${escapeHtml(run.requestedBy)}</b> · ${escapeHtml(run.openCodeSessionId ?? run.id.slice(0, 8))} · queue ${escapeHtml(run.queueJobId.slice(0, 8))}<br><span>Sailbox ${escapeHtml(run.sailboxId ?? "local")} · ${new Date(run.startedAt).toLocaleTimeString()} → ${new Date(run.completedAt).toLocaleTimeString()}</span></div>`).join("");
  const latest = next.activity.at(-1); if (latest && latest.id !== oldEvent) addLog(`${latest.actor} ${latest.detail} · v${latest.version}`);
  const roleMessage = active.role === "pm" ? "Connected as Sanjana · no local keys required" : "Host integrations: ready";
  byId("host-mode").textContent = roleMessage;
  byId("invite-expiry").textContent = `Expires ${new Date(snapshot.expiresAt).toLocaleString()}`;
  saveRecent(); clearTimeout(syncTimer); syncTimer = setTimeout(() => recallMemory(true), 1000);
}
async function connectSession(session) {
  stream?.close(); clearInterval(presenceTimer); active = session;
  render(await json(await fetch(`/v1/sessions/${session.id}`, { headers: authHeaders() })));
  active.inviteUrl = snapshot.links?.pmInviteUrl;
  await json(await fetch(`/v1/sessions/${session.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) }));
  presenceTimer = setInterval(() => fetch(`/v1/sessions/${active.id}/join`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify(person()) }).catch(() => {}), 15_000);
  stream = new EventSource(`/v1/sessions/${session.id}/events?token=${encodeURIComponent(session.token)}`);
  for (const name of ["workspace", "presence", "activity", "memory", "checkpoint", "greptile", "agent-queue"]) stream.addEventListener(name, (event) => render(JSON.parse(event.data)));
  stream.onerror = () => { byId("room-version").textContent = "reconnecting"; };
  setStatus(`Joined ${snapshot.title}. Share one capability link to collaborate.`);
}
for (const area of liveRoom.querySelectorAll("textarea")) area.addEventListener("input", () => { clearTimeout(editTimer); editTimer = setTimeout(async () => { try { render(await json(await fetch(`/v1/sessions/${active.id}/brief`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ ...person(), actor: person().name, actorId: person().id, field: area.dataset.field, value: area.value }) }))); } catch (e) { setStatus(e.message); } }, 80); });

async function recallMemory(silent = false) {
  if (!claudeMemReady || !snapshot) return;
  const memoryKey = `${snapshot.brief.problem}\n${snapshot.brief.implementation}`;
  if (silent && memoryKey === lastMemoryKey) return;
  lastMemoryKey = memoryKey;
  byId("memory-state").textContent = "Claude-Mem · recalling";
  try {
    claudeMemContext = await json(await fetch("/v1/integrations/claude-mem/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: memoryKey.replace("\n", " "), project: "relay", limit: 8 }) }));
    const newIds = claudeMemContext.observationIds.filter((id) => !snapshot.claudeMem.observationIds.includes(String(id)));
    if (newIds.length) await json(await fetch(`/v1/sessions/${active.id}/memory`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ observationIds: newIds }) }));
    byId("memory-state").textContent = claudeMemContext.observationIds.length ? `Claude-Mem · ${claudeMemContext.observationIds.length} recalled` : "Claude-Mem · listening";
    if (!silent) setStatus(`Claude-Mem supplied ${claudeMemContext.observationIds.length} cited observations.`);
  } catch { byId("memory-state").textContent = "Claude-Mem · optional"; }
}
async function health() { try { const [server, memory] = await Promise.all([json(await fetch("/health")), json(await fetch("/v1/integrations/claude-mem/status")).catch(() => ({ connected: false }))]); byId("provider").textContent = "Live"; claudeMemReady = memory.connected; byId("memory-state").textContent = memory.connected ? `Claude-Mem ${memory.version} · silent` : "Claude-Mem · optional"; byId("greptile-state").textContent = "Greptile: session-scoped"; setStatus(`Relay live · ${server.workPod.provider === "sail" ? "Sail checkpoints" : "local checkpoints"} · one serialized agent queue`); } catch (e) { byId("provider").textContent = "Offline"; setStatus(e.message); } }

byId("new-session").addEventListener("click", () => modal.showModal()); byId("close-sheet").addEventListener("click", () => modal.close());
byId("session-form").addEventListener("submit", async (event) => { event.preventDefault(); byId("create-session").disabled = true; try { const created = await json(await fetch("/v1/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: byId("session-title").value, creatorRole: "swe", repository: { name: byId("session-repo").value, prNumber: Number(byId("session-pr").value), remote: "github", defaultBranch: "main" } }) })); history.replaceState(null, "", new URL(created.creatorUrl).hash); modal.close(); await connectSession(hashSession()); } catch (e) { byId("session-error").textContent = e.message; } finally { byId("create-session").disabled = false; } });
byId("session-switch").addEventListener("change", async (event) => { const selected = recents().find((e) => e.id === event.target.value); if (!selected) return; history.replaceState(null, "", `#session=${encodeURIComponent(selected.id)}&token=${encodeURIComponent(selected.token)}&role=${selected.role}`); await connectSession(selected); });
byId("invite-session").addEventListener("click", async () => { const link = snapshot.links?.pmInviteUrl ?? active.inviteUrl; await navigator.clipboard.writeText(link); setStatus(`Invite copied · expires ${new Date(snapshot.expiresAt).toLocaleString()}`); });
byId("preview-session").addEventListener("click", () => window.open(snapshot.links?.pmInviteUrl ?? active.inviteUrl, "relay-pm-preview"));
byId("review").addEventListener("click", async () => { byId("review").disabled = true; setStatus("Syncing this PR’s Greptile findings…"); try { const m = await json(await fetch(`/v1/sessions/${active.id}/greptile/sync`, { method: "POST", headers: authHeaders() })); setStatus(`${m.totals.closed} findings closed, ${m.totals.remaining} remaining, ${m.totals.unknown} unknown.`); } catch (e) { setStatus(`Greptile sync unavailable: ${e.message}`); addLog(e.message, "warn"); } finally { byId("review").disabled = false; } });
byId("relay").addEventListener("click", async () => { byId("relay").disabled = true; setStatus("Sealing the live session into a durable checkpoint…"); try { transfer = await json(await fetch(`/v1/sessions/${active.id}/checkpoints`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ actor: person().name, claudeMemObservationIds: claudeMemContext?.observationIds ?? [] }) })); byId("agent").disabled = false; byId("two-agents").disabled = false; byId("resume").disabled = false; setStatus(`Checkpoint v${transfer.version} sealed to ${transfer.provider}.`); } catch (e) { setStatus(e.message); } finally { byId("relay").disabled = false; } });
byId("agent").addEventListener("click", async () => { if (!transfer) return setStatus("Seal a checkpoint first."); byId("agent").disabled = true; setStatus("The host’s serialized agent queue is running one next action…"); try { const result = await json(await fetch(`/v1/sessions/${active.id}/agent/run`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ target: "opencode", requestedBy: person().name, demo: true }) })); setStatus(`Host agent run ${result.status}.`); } catch (e) { setStatus(e.message); } finally { byId("agent").disabled = false; } });
byId("two-agents").addEventListener("click", async () => {
  if (!transfer && !(snapshot.checkpoints?.length)) return setStatus("Seal one Sailbox checkpoint first.");
  byId("two-agents").disabled = true;
  setStatus("Two separate OpenCode Go sessions queued on one Sailbox…");
  try {
    const run = (requestedBy) => json(fetch(`/v1/sessions/${active.id}/agent/run`, { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ target: "opencode", requestedBy, demo: true }) }));
    const results = await Promise.all([run("Ajinkya · SWE"), run("Sanjana · PM")]);
    setStatus(`Two OpenCode sessions completed in order · ${results.map((result) => result.result.id.slice(0, 8)).join(" → ")}.`);
  } catch (e) { setStatus(e.message); }
  finally { byId("two-agents").disabled = false; }
});
byId("resume").addEventListener("click", () => { if (transfer) window.open(transfer.shareUrl, "_blank"); });
for (const tab of document.querySelectorAll(".bottom-tabs span")) { tab.style.cursor = "pointer"; tab.addEventListener("click", () => byId("review").click()); }
window.addEventListener("hashchange", () => { const next = hashSession(); if (next && next.id !== active?.id) connectSession(next).catch((e) => setStatus(e.message)); });

await health(); renderSwitcher(); const initial = hashSession(); if (initial) connectSession(initial).catch((e) => { setStatus(e.message); modal.showModal(); }); else modal.showModal();
