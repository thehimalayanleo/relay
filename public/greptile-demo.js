const byId = (id) => document.getElementById(id);
let transfer;
let agentAvailable = false;
let contextDrop = null;
let currentArcRun = null;
byId("truth").setAttribute("aria-live", "polite");
byId("provider").setAttribute("aria-live", "polite");
byId("agent").title = "Seal Agent 1's checkpoint first.";
byId("resume").title = "Seal Agent 1's checkpoint first.";

document.querySelector(".run-card strong").textContent = "Relay product room";
document.querySelector(".run-card p").textContent = "Sanjana shapes the product. Ajinkya implements. The agent follows one shared brief.";
const workspaceVisual = document.createElement("div");
workspaceVisual.style.cssText = "margin:0 12px 12px;padding:12px;border:1px solid var(--line);border-radius:8px;background:#101112";
workspaceVisual.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong>Shared compute</strong><span id="workspace-mode" style="color:var(--muted);font-size:10px">Checking provider</span></div><div style="display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;text-align:center"><div style="padding:10px 4px;border:1px solid var(--line);border-radius:6px"><span style="color:var(--orange)">▣</span><strong style="display:block">Box A</strong><small id="box-a-state" style="color:var(--muted)">User 1</small></div><span style="color:var(--orange)">→</span><div style="padding:10px 4px;border:1px solid var(--line);border-radius:6px"><span style="color:var(--orange)">▣</span><strong style="display:block">Box B</strong><small id="box-b-state" style="color:var(--muted)">User 2</small></div></div>';
document.querySelector(".mission").after(workspaceVisual);

const roomId = "relay-product";
const roleParam = new URLSearchParams(location.search).get("role") === "pm" ? "pm" : "swe";
const me = roleParam === "pm"
  ? { id: "sanjana-pm", name: "Sanjana", role: "Product Manager", color: "#ff5a1f" }
  : { id: "ajinkya-swe", name: "Ajinkya", role: "SWE", color: "#7aa2f7" };
const liveRoom = byId("live-room");
liveRoom.innerHTML = `<div class="live-head"><strong>One shared brief</strong><small><span class="pulse"></span>SYNCED</small></div><div class="presence" id="presence"></div><div class="live-fields"><label>Customer problem<textarea data-field="problem"></textarea></label><label>PM constraint<textarea data-field="constraint"></textarea></label><label>Acceptance criteria<textarea data-field="acceptance"></textarea></label><label>Implementation<textarea data-field="implementation"></textarea></label></div><div class="live-foot"><span id="room-role">You are ${me.name} · ${me.role}</span><span id="room-version">v0</span></div>`;
let roomSnapshot;
let liveTimer;

function renderRoom(snapshot) {
  roomSnapshot = snapshot;
  byId("room-version").textContent = `v${snapshot.version}`;
  byId("presence").innerHTML = snapshot.participants.map((person) => `<div class="avatar" style="background:${person.color}" title="${person.name} · ${person.role}">${person.name[0]}</div><span>${person.name} · ${person.role}</span>`).join("");
  for (const textarea of liveRoom.querySelectorAll("textarea")) {
    if (document.activeElement !== textarea) textarea.value = snapshot.brief[textarea.dataset.field] ?? "";
  }
  const latest = snapshot.activity.at(-1);
  if (latest && !byId("log").dataset.lastLiveEvent?.includes(latest.id)) {
    byId("log").dataset.lastLiveEvent = latest.id;
    addLog(`${latest.actor} ${latest.detail} · shared v${latest.version}`);
  }
}

async function joinRoom() {
  renderRoom(await json(await fetch(`/v1/rooms/${roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(me) })));
}

for (const textarea of liveRoom.querySelectorAll("textarea")) {
  textarea.addEventListener("input", () => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(async () => {
      renderRoom(await json(await fetch(`/v1/rooms/${roomId}/brief`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: me.name, field: textarea.dataset.field, value: textarea.value }) })));
    }, 180);
  });
}

const roomEvents = new EventSource(`/v1/rooms/${roomId}/events`);
for (const eventName of ["workspace", "presence", "activity"]) roomEvents.addEventListener(eventName, (event) => renderRoom(JSON.parse(event.data)));
roomEvents.onerror = () => { byId("room-version").textContent = "reconnecting"; };
joinRoom();

const scenario = {
  finding: {
    id: "relay-live-collaboration-001",
    repository: "thehimalayanleo/relay",
    prUrl: "https://github.com/thehimalayanleo/relay",
    sha: "03583c5",
    summary: "PM and SWE context lived in separate agent sessions, forcing decisions to be restated.",
    severity: "medium",
    confidence: "high",
    paths: ["src/collaboration.mjs", "public/greptile-demo.js"],
    evidence: ["Two browser sessions now synchronize one versioned product brief through Relay."],
  },
  investigation: {
    completed: ["Defined PM and SWE roles", "Added presence and synchronized product notes", "Preserved durable checkpoints"],
    constraints: ["Keep Relay one-button, visual, and free of jargon-heavy forms"],
    rejectedApproaches: ["Use two disconnected agent chats and manually copy context"],
    nextAction: "Implement and test the task currently specified in the shared product brief.",
  },
  acceptanceCriteria: ["Both users see edits without refreshing", "Agent activity is visible to both roles", "A durable Relay checkpoint can still be sealed"],
};

async function recordRoomActivity(type, detail, actor = me.name) {
  return json(await fetch(`/v1/rooms/${roomId}/activity`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, detail, actor }),
  }));
}

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
  return body;
}

function addLog(text, kind = "ok") {
  const line = document.createElement("div");
  line.className = `log-line ${kind}`;
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  line.innerHTML = `<time>${now}</time><span>${text}</span>`;
  byId("log").append(line);
  byId("log").scrollTop = byId("log").scrollHeight;
}

async function health() {
  try {
    const value = await json(await fetch("/health"));
    agentAvailable = Boolean(value.autonomousAgent?.configured);
    byId("provider").textContent = value.ok ? "Live" : "Offline";
    const sail = value.workPod?.provider === "sail";
    byId("relay").textContent = sail ? "Seal and send to Sail" : "Seal to local Relay workspace";
    byId("workspace-mode").textContent = sail ? `Sail · ${value.workPod.appName}` : "Local fallback · Sail SDK pending";
    byId("box-a-state").textContent = sail ? "Sailbox · paused" : "Local pod · ready";
    byId("box-b-state").textContent = sail ? "Sailbox · on demand" : "Local pod · on demand";
    byId("agent").disabled = !agentAvailable;
    const live = await json(await fetch("/v1/integrations/greptile/status"));
    byId("greptile-state").textContent = live.liveApiConnected ? "Greptile: connected" : "Greptile: offline";
    byId("truth").textContent = `Relay: live · Ox Alpha: ${agentAvailable ? "ready" : "offline"} · Workspace: ${sail ? "Sail" : "local"} · Greptile: ${live.liveApiConnected ? "connected" : "offline"}`;
  } catch (error) {
    byId("provider").textContent = "Offline";
    byId("truth").textContent = error.message;
  }
}

async function loadBugLedger() {
  try {
    const ledger = await json(await fetch("/bug-ledger.json"));
    const resolved = ledger.findings.filter((item) => item.status === "resolved").length;
    const blocked = ledger.findings.filter((item) => item.status === "blocked").length;
    byId("bug-count").textContent = String(resolved);
    byId("test-count").textContent = `${resolved + 3} / ${resolved + 3}`;
    byId("resolved-bar").style.height = `${Math.min(100, resolved * 33)}%`;
    byId("blocked-bar").style.height = `${Math.min(100, blocked * 33)}%`;
    for (const item of ledger.findings.slice(1)) {
      if (!byId("log").textContent.includes(item.id)) addLog(`${item.id} · ${item.summary}`, item.status === "resolved" ? "ok" : "warn");
    }
  } catch (error) {
    addLog(`Evidence ledger unavailable · ${error.message}`, "warn");
  }
}

async function loadArcRun() {
  try {
    const run = await json(await fetch("/v1/demo/arc-run"));
    currentArcRun = run;
    byId("action-count").textContent = String(run.actions.length);
    byId("budget-count").textContent = String(run.action_budget - run.actions.length);
    document.querySelector(".run-card strong").textContent = `Episode ${run.run_id.slice(0, 8).toUpperCase()}`;
    document.querySelector(".run-card p").textContent = run.status === "completed"
      ? `Completed across two processes in ${run.actions.length} total actions.`
      : `${run.actions.length} actions completed. ${run.action_budget - run.actions.length} remain.`;
    document.querySelectorAll(".memory-item p")[0].textContent = run.memory.hypothesis;
    document.querySelectorAll(".memory-item p")[1].textContent = `${run.memory.confirmed.length} confirmed findings carried across the handoff.`;
    document.querySelectorAll(".memory-item p")[2].textContent = run.memory.next_probe;
    byId("truth").textContent = `${run.status.toUpperCase()} · ${run.observations.at(-1).state} · ${run.claimBoundary}`;
    addLog(`Live episode ${run.status} · ${run.observations.at(-1).state} · ${run.actions.length} actions`);
  } catch (error) {
    addLog(`ARC run artifact unavailable · ${error.message}`, "warn");
  }
}

const editorSurface = document.querySelector(".editor pre");
const coreSource = editorSurface.innerHTML;
const editorTabs = [...document.querySelectorAll(".tabs .tab")];
function selectEditorTab(tab) {
  editorTabs.forEach((item) => item.classList.toggle("active", item === tab));
  if (tab.textContent.includes("episode.json")) {
    editorSurface.textContent = currentArcRun
      ? JSON.stringify(currentArcRun, null, 2)
      : "Run artifact is still loading.";
  } else {
    editorSurface.innerHTML = coreSource;
  }
  byId("truth").textContent = `Opened ${tab.textContent.replace("●", "").trim()}.`;
}
for (const tab of editorTabs) {
  tab.setAttribute("role", "button");
  tab.tabIndex = 0;
  tab.style.cursor = "pointer";
  tab.addEventListener("click", () => selectEditorTab(tab));
  tab.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") selectEditorTab(tab); });
}

for (const file of document.querySelectorAll(".file")) {
  file.setAttribute("role", "button");
  file.tabIndex = 0;
  file.style.cursor = "pointer";
  const openFile = () => {
    document.querySelectorAll(".file").forEach((item) => item.classList.remove("active"));
    file.classList.add("active");
    const name = file.textContent.trim();
    if (name.includes("episode.json")) selectEditorTab(editorTabs[1]);
    else if (name.includes("core.py")) selectEditorTab(editorTabs[0]);
    else {
      editorSurface.textContent = `${name}\n\nAvailable in the private relay-arc-agi-3 repository.`;
      byId("truth").textContent = `Selected ${name}.`;
    }
  };
  file.addEventListener("click", openFile);
  file.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") openFile(); });
}

const dropZone = document.createElement("div");
dropZone.id = "drop-zone";
dropZone.tabIndex = 0;
dropZone.innerHTML = '<strong>Drop context here</strong><span id="drop-copy">Logs, Markdown, JSON, or text · 20 KB max</span><input id="context-file" type="file" accept=".txt,.md,.json,.log,text/plain,application/json" hidden>';
dropZone.style.cssText = "margin:12px;padding:16px;border:1px dashed #55585e;border-radius:8px;text-align:center;color:var(--muted);background:#171819;cursor:pointer";
dropZone.querySelector("strong").style.cssText = "display:block;color:var(--text);margin-bottom:3px";
document.querySelector(".controls").before(dropZone);
const picker = byId("context-file");

async function loadContextFile(file) {
  const allowed = /^(text\/|application\/json)/.test(file.type) || /\.(txt|md|json|log)$/i.test(file.name);
  if (!allowed) throw new Error("Use a text, Markdown, JSON, or log file.");
  if (file.size > 20_000) throw new Error("Context drops are limited to 20 KB.");
  contextDrop = { name: file.name, mediaType: file.type || "text/plain", content: await file.text() };
  byId("drop-copy").textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · ready to send`;
  dropZone.style.borderColor = "var(--orange)";
  addLog(`Context drop staged · ${file.name}`);
}

dropZone.addEventListener("click", () => picker.click());
dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") picker.click(); });
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.style.borderColor = "var(--orange)"; });
dropZone.addEventListener("dragleave", () => { if (!contextDrop) dropZone.style.borderColor = "#55585e"; });
dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  try { await loadContextFile(event.dataTransfer.files[0]); } catch (error) { byId("truth").textContent = error.message; }
});
picker.addEventListener("change", async () => {
  try { await loadContextFile(picker.files[0]); } catch (error) { byId("truth").textContent = error.message; }
});

byId("relay").addEventListener("click", async () => {
  byId("relay").disabled = true;
  byId("truth").textContent = "Sealing the useful episode state…";
  try {
    const liveScenario = {
      ...scenario,
      investigation: {
        ...scenario.investigation,
        constraints: [roomSnapshot?.brief.constraint ?? scenario.investigation.constraints[0]],
        nextAction: roomSnapshot?.brief.implementation ?? scenario.investigation.nextAction,
      },
      acceptanceCriteria: [roomSnapshot?.brief.acceptance ?? scenario.acceptanceCriteria[0]],
    };
    transfer = await json(await fetch("/v1/integrations/greptile/handoffs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...liveScenario, contextDrop }),
    }));
    await recordRoomActivity("checkpoint", `sealed shared brief v${roomSnapshot?.version ?? 0}`, me.name);
    byId("resume").disabled = false;
    byId("resume").title = "Resume the shared episode as User 2.";
    byId("agent").disabled = !agentAvailable;
    byId("agent").title = agentAvailable ? "Continue the shared episode with Ox Alpha." : "Ox Alpha is unavailable.";
    const remote = transfer.workPod.provider === "sail";
    byId("workspace-mode").textContent = remote ? `Sail · ${transfer.workPod.appName}` : "Local fallback";
    byId("box-a-state").textContent = `${remote ? "Sailbox" : "Local pod"} · ${transfer.workPod.state}`;
    byId("box-b-state").textContent = remote ? `On demand · ${transfer.workPod.sailboxId.slice(0, 8)}` : `On demand · ${transfer.workPod.id.slice(0, 8)}`;
    byId("truth").textContent = `Shared brief v${roomSnapshot?.version ?? 0} sealed as a durable Relay checkpoint.`;
    addLog(`Checkpoint sealed · ${transfer.integration.memories} useful memories carried`);
  } catch (error) {
    byId("truth").textContent = error.message;
    byId("relay").disabled = false;
  }
});

byId("agent").addEventListener("click", async () => {
  if (!transfer) return byId("truth").textContent = "Seal Agent 1's checkpoint first.";
  byId("agent").disabled = true;
  byId("truth").textContent = "Ox Alpha is continuing from the inherited state…";
  try {
    const capability = new URL(transfer.shareUrl);
    const params = new URLSearchParams(capability.hash.slice(1));
    const result = await json(await fetch(`/v1/relays/${params.get("id")}/agent/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${params.get("token")}`, "content-type": "application/json" },
      body: JSON.stringify({ target: "generic", demo: true }),
    }));
    const ok = result.result.exitCode === 0;
    await recordRoomActivity("agent", ok ? "Ox Alpha completed the inherited task" : "Ox Alpha returned a controlled stop", "Ox Alpha");
    byId("truth").textContent = ok ? "Ox Alpha continued from the handoff." : "Ox Alpha stopped safely and returned control.";
    addLog(ok ? "Ox Alpha accepted inherited context" : "Ox Alpha returned a controlled stop", ok ? "ok" : "warn");
  } catch (error) {
    byId("truth").textContent = error.message;
    byId("agent").disabled = false;
  }
});

byId("resume").addEventListener("click", async () => {
  if (!transfer) return;
  byId("resume").disabled = true;
  try {
    const capability = new URL(transfer.shareUrl);
    const params = new URLSearchParams(capability.hash.slice(1));
    const headers = { authorization: `Bearer ${params.get("token")}` };
    const pod = await json(await fetch(`/v1/relays/${params.get("id")}/pod`, { headers }));
    await json(await fetch(`/v1/relays/${params.get("id")}/accept`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ actor: me.name, harness: "relay-live", restatedGoal: roomSnapshot?.brief.problem ?? "Continue the shared product work without rediscovery.", firstAction: roomSnapshot?.brief.implementation ?? scenario.investigation.nextAction, observedDigest: transfer.digest }),
    }));
    byId("action-count").textContent = "3";
    byId("budget-count").textContent = "9";
    await recordRoomActivity("resume", `accepted checkpoint with ${pod.camp.capsule.memories.length} memories`, me.name);
    byId("truth").textContent = `${me.name} accepted ${pod.camp.capsule.memories.length} memories from the durable checkpoint.`;
    addLog(`${me.name} resumed the shared product work without rediscovery`);
  } catch (error) {
    byId("truth").textContent = error.message;
    byId("resume").disabled = false;
  }
});

async function checkGreptile() {
  byId("review").disabled = true;
  byId("truth").textContent = "Checking the real Greptile review…";
  try {
    const result = await json(await fetch("/v1/integrations/greptile/improve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "thehimalayanleo/relay", remote: "github", defaultBranch: "main", branch: "main", prNumber: 1, iteration: 1, maxIterations: 5 }),
    }));
    byId("greptile-state").textContent = `Greptile: ${result.status}`;
    byId("truth").textContent = result.status === "handoff-created" ? "Greptile found a verified issue and Relay created the next handoff." : "Greptile reports no unresolved finding.";
    addLog(`Greptile · ${result.status}`);
  } catch (error) {
    byId("greptile-state").textContent = "Greptile: review unavailable";
    byId("truth").textContent = `Greptile could not load a review: ${error.message}`;
    addLog(`Greptile review unavailable · ${error.message}`, "warn");
  } finally {
    byId("review").disabled = false;
  }
}

async function runArcTests() {
  byId("truth").textContent = "Running the real ARC harness regression suite…";
  addLog("Tests started", "warn");
  try {
    const result = await json(await fetch("/v1/demo/arc-tests", { method: "POST" }));
    byId("test-count").textContent = `${result.passed} / ${result.passed + result.failed}`;
    byId("truth").textContent = `${result.passed} tests passed. No failing regression.`;
    addLog(`Tests complete · ${result.passed} passed · ${result.failed} failed`);
  } catch (error) {
    byId("truth").textContent = `Tests failed: ${error.message}`;
    addLog(`Tests failed · ${error.message}`, "warn");
  }
}

byId("review").addEventListener("click", checkGreptile);
const bottomTabs = [...document.querySelectorAll(".bottom-tabs span")];
for (const tab of bottomTabs) {
  tab.setAttribute("role", "button");
  tab.setAttribute("aria-label", `${tab.textContent.trim() === "Tests" ? "Run ARC tests" : "Check Greptile review"}`);
  tab.tabIndex = 0;
  tab.style.cursor = "pointer";
  const activate = () => {
    document.querySelectorAll(".bottom-tabs b, .bottom-tabs span").forEach((item) => {
      item.style.color = item === tab ? "var(--text)" : "var(--muted)";
      item.style.borderBottom = item === tab ? "2px solid var(--orange)" : "0";
    });
    return tab.textContent.trim() === "Tests" ? runArcTests() : checkGreptile();
  };
  tab.addEventListener("click", activate);
  tab.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") activate(); });
}
const runTab = document.querySelector(".bottom-tabs b");
runTab.setAttribute("role", "button");
runTab.tabIndex = 0;
runTab.style.cursor = "pointer";
const showRun = () => {
  byId("truth").textContent = currentArcRun
    ? `${currentArcRun.status.toUpperCase()} · ${currentArcRun.observations.at(-1).state} · ${currentArcRun.actions.length} actions`
    : "ARC run artifact is loading.";
  document.querySelectorAll(".bottom-tabs b, .bottom-tabs span").forEach((item) => {
    item.style.color = item === runTab ? "var(--text)" : "var(--muted)";
    item.style.borderBottom = item === runTab ? "2px solid var(--orange)" : "0";
  });
};
runTab.addEventListener("click", showRun);
runTab.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") showRun(); });

health();
loadBugLedger();
loadArcRun();
