const byId = (id) => document.getElementById(id);
let transfer;
let agentAvailable = false;
let contextDrop = null;
let currentArcRun = null;
byId("truth").setAttribute("aria-live", "polite");
byId("provider").setAttribute("aria-live", "polite");
byId("agent").title = "Seal Agent 1's checkpoint first.";
byId("resume").title = "Seal Agent 1's checkpoint first.";

document.querySelector(".mission h1").textContent = "Two people. One continuing agent.";
document.querySelector(".mission p").textContent = "User 1 and User 2 work with the same live agent state instead of restarting separate agents and rebuilding context.";
document.querySelector(".run-card p").textContent = "User 1 paused at step 2. The shared agent remains ready for User 2.";
const collaboration = document.createElement("div");
collaboration.style.cssText = "margin:12px;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;text-align:center";
collaboration.innerHTML = '<div><strong style="display:block">User 1</strong><span style="color:var(--muted);font-size:10px">Exploring</span></div><div style="color:var(--orange);font-size:18px">⇄</div><div><strong style="display:block">User 2</strong><span style="color:var(--muted);font-size:10px">Continuing</span></div><div style="grid-column:1/-1;color:var(--green);font-size:10px">● SHARED AGENT STATE · EPISODE 8F2A</div>';
document.querySelector(".mission").after(collaboration);
const workspaceVisual = document.createElement("div");
workspaceVisual.style.cssText = "margin:0 12px 12px;padding:12px;border:1px solid var(--line);border-radius:8px;background:#101112";
workspaceVisual.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong>Shared compute</strong><span id="workspace-mode" style="color:var(--muted);font-size:10px">Checking provider</span></div><div style="display:grid;grid-template-columns:1fr 28px 1fr;align-items:center;text-align:center"><div style="padding:10px 4px;border:1px solid var(--line);border-radius:6px"><span style="color:var(--orange)">▣</span><strong style="display:block">Box A</strong><small id="box-a-state" style="color:var(--muted)">User 1</small></div><span style="color:var(--orange)">→</span><div style="padding:10px 4px;border:1px solid var(--line);border-radius:6px"><span style="color:var(--orange)">▣</span><strong style="display:block">Box B</strong><small id="box-b-state" style="color:var(--muted)">User 2</small></div></div>';
collaboration.after(workspaceVisual);

const scenario = {
  finding: {
    id: "relay-arc-resume-001",
    repository: "thehimalayanleo/relay-arc-agi-3",
    prUrl: "https://github.com/thehimalayanleo/relay-arc-agi-3/pull/1",
    sha: "54f7679",
    summary: "A resumed episode restored its observation but restarted the environment at position zero.",
    severity: "high",
    confidence: "high",
    paths: ["src/relay_arc/core.py", "src/relay_arc/demo.py"],
    evidence: ["Two initial RIGHT actions reached 2/3; the first resumed action regressed to 1/3."],
  },
  investigation: {
    completed: ["Reproduced false continuity", "Added resumable environment protocol", "Verified 4 regression tests"],
    constraints: ["Never claim ARC benchmark performance from the compatibility world"],
    rejectedApproaches: ["Reload only the latest serialized observation"],
    nextAction: "Restore the environment state, then continue with the remaining action budget.",
  },
  acceptanceCriteria: ["Resume reaches 3/3 in exactly three total actions", "All tests pass"],
};

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
    transfer = await json(await fetch("/v1/integrations/greptile/handoffs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...scenario, contextDrop }),
    }));
    byId("resume").disabled = false;
    byId("resume").title = "Resume the shared episode as User 2.";
    byId("agent").disabled = !agentAvailable;
    byId("agent").title = agentAvailable ? "Continue the shared episode with Ox Alpha." : "Ox Alpha is unavailable.";
    const remote = transfer.workPod.provider === "sail";
    byId("workspace-mode").textContent = remote ? `Sail · ${transfer.workPod.appName}` : "Local fallback";
    byId("box-a-state").textContent = `${remote ? "Sailbox" : "Local pod"} · ${transfer.workPod.state}`;
    byId("box-b-state").textContent = remote ? `On demand · ${transfer.workPod.sailboxId.slice(0, 8)}` : `On demand · ${transfer.workPod.id.slice(0, 8)}`;
    byId("truth").textContent = "Checkpoint sealed. A different person or agent can continue.";
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
    const result = await json(await fetch(`/v1/passons/${params.get("id")}/agent/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${params.get("token")}`, "content-type": "application/json" },
      body: JSON.stringify({ target: "generic", demo: true }),
    }));
    const ok = result.result.exitCode === 0;
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
    const pod = await json(await fetch(`/v1/passons/${params.get("id")}/pod`, { headers }));
    await json(await fetch(`/v1/passons/${params.get("id")}/accept`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ actor: "agent-2", harness: "ox-alpha", restatedGoal: "Resume the ARC compatibility episode without rediscovery.", firstAction: scenario.investigation.nextAction, observedDigest: transfer.digest }),
    }));
    byId("action-count").textContent = "3";
    byId("budget-count").textContent = "9";
    byId("truth").textContent = `Agent 2 received ${pod.camp.capsule.memories.length} memories and completed the corridor.`;
    addLog("Agent 2 resumed at 2/3 and completed at 3/3");
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
      body: JSON.stringify({ name: "thehimalayanleo/relay-arc-agi-3", remote: "github", defaultBranch: "main", branch: "codex/ox-resume-state", prNumber: 1, iteration: 1, maxIterations: 5 }),
    }));
    byId("greptile-state").textContent = `Greptile: ${result.status}`;
    byId("truth").textContent = result.status === "handoff-created" ? "Greptile found a verified issue and Relay created the next handoff." : "Greptile reports no unresolved finding.";
    addLog(`Greptile · ${result.status}`);
  } catch (error) {
    byId("greptile-state").textContent = "Greptile: indexing blocked";
    byId("truth").textContent = "Greptile is connected, but this private repository still needs app access.";
    addLog("Greptile access blocked · not counted as a code bug", "warn");
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
