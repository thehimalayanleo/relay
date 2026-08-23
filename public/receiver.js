const params = new URLSearchParams(location.hash.replace(/^#/, ""));
const id = params.get("id");
const token = params.get("token");
const api = `/v1/relays/${encodeURIComponent(id || "")}`;
let record;

const byId = (value) => document.getElementById(value);
const auth = { authorization: `Bearer ${token}` };
const list = (items) => items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>None recorded.</p>";
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function load() {
  const response = await fetch(api, { headers: auth });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  record = body;
  const c = record.capsule;
  byId("title").textContent = c.title;
  byId("status").textContent = record.status;
  byId("digest").textContent = record.digest;
  byId("summary").innerHTML = `
    <h3>Objective</h3><p>${escapeHtml(c.goal)}</p>
    <h3>Completed</h3>${list(c.state.completed)}
    <h3>Constraints</h3>${list(c.constraints)}
    <h3>Next safe action</h3><p>${escapeHtml(c.nextAction)}</p>`;
  byId("restated-goal").value = c.goal;
  byId("first-action").value = c.nextAction;
  if (record.workPod) {
    byId("pod-card").hidden = false;
    byId("pod-title").textContent = record.workPod.provider === "local-demo" ? "Local demo pod" : "Sail work pod";
    byId("pod-detail").textContent = `${record.workPod.state} · ${record.workPod.files.length} context files`;
  }
}

byId("pull-pod").addEventListener("click", async () => {
  const response = await fetch(`${api}/pod`, { headers: auth });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  byId("pod-title").textContent = "Context pulled";
  byId("pod-detail").textContent = body.files.join(" · ");
  byId("notice").textContent = "The pod supplied its sealed CAMP bundle and handoff brief.";
});

byId("run-agent").addEventListener("click", async () => {
  byId("run-agent").disabled = true;
  byId("notice").textContent = "The configured autonomous harness is continuing this checkpoint...";
  try {
    const response = await fetch(`${api}/agent/run`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ target: byId("target").value }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
    byId("status").textContent = body.status;
    byId("pod-detail").textContent = `${body.result.harness} · exit ${body.result.exitCode} · ${body.result.durationMs}ms`;
    byId("notice").textContent = `Agent result stored as agents/${body.result.id}.json in the work pod.`;
  } finally {
    byId("run-agent").disabled = false;
  }
});

byId("terminate-pod").addEventListener("click", async () => {
  if (!window.confirm("Terminate this work pod? A Sailbox cannot be restarted after termination.")) return;
  const response = await fetch(`${api}/pod/terminate`, { method: "POST", headers: auth });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  byId("pod-title").textContent = "Work pod terminated";
  byId("pod-detail").textContent = body.workPod.terminatedAt;
  byId("pull-pod").disabled = true;
  byId("run-agent").disabled = true;
  byId("terminate-pod").disabled = true;
  byId("notice").textContent = "The work pod has been terminated. The sealed Relay record remains until expiry.";
});

byId("copy-prompt").addEventListener("click", async () => {
  const target = byId("target").value;
  const response = await fetch(`${api}/render?target=${encodeURIComponent(target)}`, { headers: auth });
  if (!response.ok) throw new Error((await response.json()).message || `HTTP ${response.status}`);
  await navigator.clipboard.writeText(await response.text());
  byId("notice").textContent = `Resume prompt copied for ${target}.`;
});

byId("accept").addEventListener("click", async () => {
  const response = await fetch(`${api}/accept`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      actor: byId("actor").value || "recipient",
      harness: byId("target").value,
      restatedGoal: byId("restated-goal").value,
      firstAction: byId("first-action").value,
      observedDigest: record.digest,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
  byId("status").textContent = "accepted";
  byId("notice").textContent = `Receipt issued at ${body.receipt.acceptedAt}. Responsibility accepted by ${body.receipt.actor}.`;
});

load().catch((error) => {
  byId("title").textContent = "Cannot open this relay";
  byId("status").textContent = "invalid";
  byId("notice").textContent = error.message;
});
