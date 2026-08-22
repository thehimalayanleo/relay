const destinationMeta = {
  codex: { label: "Codex", glyph: "</>" },
  claude: { label: "Claude", glyph: "✦" },
  cursor: { label: "Cursor", glyph: "↖" },
};

export class PassOnButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.target = this.getAttribute("default-target") || "claude";
    this.result = null;
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.querySelector(".port").addEventListener("click", () => this.open());
    this.shadowRoot.querySelector(".backdrop").addEventListener("click", (event) => {
      if (event.target.classList.contains("backdrop")) this.close();
    });
    this.shadowRoot.querySelector(".close").addEventListener("click", () => this.close());
    this.shadowRoot.querySelector(".primary").addEventListener("click", () => this.createLink());
    this.shadowRoot.querySelector(".copy").addEventListener("click", () => this.copyLink());
    this.shadowRoot.querySelector(".open-link").addEventListener("click", () => {
      if (this.result?.shareUrl) window.open(this.result.shareUrl, "_blank", "noopener");
    });
    for (const button of this.shadowRoot.querySelectorAll(".destination")) {
      button.addEventListener("click", () => this.selectTarget(button.dataset.target));
    }
    this.escapeHandler = (event) => {
      if (event.key === "Escape") this.close();
    };
    document.addEventListener("keydown", this.escapeHandler);
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this.escapeHandler);
  }

  capsule() {
    const selector = this.getAttribute("source");
    const source = selector ? document.querySelector(selector) : null;
    if (!source) throw new Error("Context source not found.");
    return JSON.parse(source.value || source.textContent);
  }

  open() {
    try {
      const capsule = this.capsule();
      this.shadowRoot.querySelector(".source-name").textContent = this.getAttribute("source-app") || capsule.source?.harness || document.title;
      this.shadowRoot.querySelector(".preview").textContent = capsule.traceSummary || capsule.goal || capsule.title;
      this.shadowRoot.querySelector(".objective").textContent = capsule.goal || "No objective supplied.";
      this.shadowRoot.querySelector(".context-size").textContent = `${JSON.stringify(capsule).length.toLocaleString()} chars`;
      this.shadowRoot.querySelector(".backdrop").classList.add("visible");
      this.shadowRoot.querySelector(".backdrop").setAttribute("aria-hidden", "false");
      this.shadowRoot.querySelector(".panel").focus();
    } catch (error) {
      this.emitError(error.message);
    }
  }

  close() {
    this.shadowRoot.querySelector(".backdrop").classList.remove("visible");
    this.shadowRoot.querySelector(".backdrop").setAttribute("aria-hidden", "true");
  }

  selectTarget(target) {
    this.target = target;
    for (const button of this.shadowRoot.querySelectorAll(".destination")) {
      button.classList.toggle("selected", button.dataset.target === target);
    }
    this.shadowRoot.querySelector(".target-name").textContent = destinationMeta[target].label;
    this.shadowRoot.querySelector(".target-glyph").textContent = destinationMeta[target].glyph;
    this.shadowRoot.querySelector(".primary-label").textContent = `Create ${destinationMeta[target].label} work pod + link`;
  }

  async createLink() {
    const primary = this.shadowRoot.querySelector(".primary");
    const status = this.shadowRoot.querySelector(".status");
    try {
      primary.disabled = true;
      status.textContent = "Sealing a bounded checkpoint...";
      const capsule = this.capsule();
      capsule.intendedRecipient = destinationMeta[this.target].label;
      const endpoint = this.getAttribute("endpoint") || window.location.origin;
      const response = await fetch(`${endpoint}/v1/passons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capsule, ttlHours: 72, workPod: { requested: true } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
      this.result = result;
      this.shadowRoot.querySelector(".pod-name").textContent = result.workPod?.provider === "local-demo" ? "Demo pod" : "Sailbox";
      this.shadowRoot.querySelector(".pod-icon").classList.add("ready");
      this.shadowRoot.querySelector(".digest").textContent = result.digest.slice(0, 12);
      this.shadowRoot.querySelector(".state").textContent = "LINK READY";
      this.shadowRoot.querySelector(".state-dot").classList.add("ready");
      this.shadowRoot.querySelector(".result").classList.add("visible");
      await this.copyLink();
      status.textContent = "Handoff link copied. The recipient opens it in any browser.";
      this.dispatchEvent(new CustomEvent("passon-created", { detail: result }));
    } catch (error) {
      status.textContent = error.message;
      this.emitError(error.message);
    } finally {
      primary.disabled = false;
    }
  }

  async copyLink() {
    if (!this.result?.shareUrl) return;
    await navigator.clipboard.writeText(this.result.shareUrl);
    const copy = this.shadowRoot.querySelector(".copy");
    copy.textContent = "Copied ✓";
    window.setTimeout(() => { copy.textContent = "Copy link"; }, 1600);
  }

  emitError(message) {
    this.dispatchEvent(new CustomEvent("passon-error", { detail: { message } }));
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { all: initial; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        .port { position: fixed; right: 24px; bottom: 24px; z-index: 2147483000; width: 54px; height: 54px; padding: 0; border: 1px solid rgba(255,255,255,.2); border-radius: 50%; color: white; background: #111; box-shadow: 0 16px 35px rgba(0,0,0,.28); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
        .port:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 19px 40px rgba(0,0,0,.34); }
        .port-glyph { display: grid; place-items: center; font-size: 21px; font-weight: 800; }
        .backdrop { position: fixed; inset: 0; z-index: 2147482999; display: flex; justify-content: flex-end; align-items: flex-end; padding: 90px 24px; background: rgba(19,21,23,.22); backdrop-filter: blur(2px) saturate(.85); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
        .backdrop.visible { opacity: 1; pointer-events: auto; }
        .panel { width: min(408px, calc(100vw - 28px)); color: #181a18; background: rgba(250,249,245,.97); border: 1px solid rgba(24,26,24,.13); border-radius: 22px; box-shadow: 0 28px 80px rgba(0,0,0,.26); overflow: hidden; transform: translateY(10px) scale(.98); transition: transform .2s ease; outline: none; }
        .visible .panel { transform: translateY(0) scale(1); }
        .head { display: flex; align-items: center; gap: 10px; padding: 14px 15px; border-bottom: 1px solid rgba(24,26,24,.1); }
        .mark { display: grid; place-items: center; width: 30px; height: 30px; color: white; background: #111; border-radius: 9px; font-weight: 850; }
        .brand { display: grid; gap: 1px; }
        .brand strong { font-size: 11px; letter-spacing: .14em; }
        .brand span { color: #6b6e67; font-size: 10px; }
        .mode { margin-left: auto; color: #7653c8; font: 700 9px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
        .close { width: 26px; height: 26px; padding: 0; color: #555a53; border: 0; border-radius: 50%; background: rgba(0,0,0,.055); cursor: pointer; }
        .body { display: grid; gap: 13px; padding: 15px; }
        .label { margin: 0 0 7px; color: #73776f; font-size: 9px; font-weight: 800; letter-spacing: .12em; }
        .destinations { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
        .destination { display: flex; justify-content: center; align-items: center; gap: 6px; min-height: 36px; color: #242624; border: 1px solid rgba(24,26,24,.1); border-radius: 10px; background: rgba(255,255,255,.55); font-size: 11px; font-weight: 700; cursor: pointer; }
        .destination.selected { color: white; background: #111; border-color: #111; }
        .space { padding: 11px; border: 1px solid rgba(118,83,200,.17); border-radius: 13px; background: rgba(118,83,200,.06); }
        .space-head, .receipt { display: flex; align-items: center; }
        .space-head { margin-bottom: 8px; }
        .space-head .label { margin: 0; }
        .space-tag { margin-left: auto; color: #7653c8; font: 750 8px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .route { display: grid; grid-template-columns: 62px 1fr 62px 1fr 62px; align-items: center; gap: 3px; }
        .node { display: grid; justify-items: center; gap: 4px; min-width: 0; }
        .node-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: rgba(0,0,0,.07); font-size: 10px; font-weight: 850; }
        .pod-icon { color: #7653c8; background: rgba(118,83,200,.13); }
        .pod-icon.ready { color: white; background: #7653c8; }
        .node-name { width: 100%; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; font-weight: 700; }
        .lineage { display: flex; align-items: center; }
        .lineage i { flex: 1; height: 1px; background: rgba(118,83,200,.42); }
        .lineage b { display: grid; place-items: center; width: 22px; height: 22px; color: #7653c8; border-radius: 50%; background: rgba(118,83,200,.13); font-size: 11px; }
        .context { padding: 11px; border: 1px solid rgba(24,26,24,.1); border-radius: 13px; background: rgba(255,255,255,.58); }
        .context-top { display: flex; justify-content: space-between; gap: 10px; }
        .context-size { color: #7d8179; font: 9px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .objective { margin: 0 0 6px; font-size: 12px; font-weight: 750; line-height: 1.35; }
        .preview { display: -webkit-box; overflow: hidden; margin: 0; color: #5f635c; font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
        .primary { width: 100%; min-height: 44px; padding: 0 13px; color: white; border: 0; border-radius: 12px; background: #111; font-size: 12px; font-weight: 800; cursor: pointer; }
        .primary:disabled { opacity: .6; cursor: wait; }
        .receipt { gap: 7px; min-height: 17px; }
        .state-dot { width: 6px; height: 6px; border-radius: 50%; background: #e39c35; }
        .state-dot.ready { background: #2b9a62; }
        .state, .digest { font: 750 8px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .digest { color: #73776f; }
        .status { margin: 0; color: #6b6e67; font-size: 10px; line-height: 1.4; }
        .result { display: none; grid-template-columns: 1fr 1fr; gap: 7px; }
        .result.visible { display: grid; }
        .copy, .open-link { min-height: 34px; border: 1px solid rgba(24,26,24,.12); border-radius: 9px; background: white; color: #242624; font-size: 10px; font-weight: 750; cursor: pointer; }
        @media (max-width: 560px) { .backdrop { align-items: flex-end; padding: 70px 14px 82px; } .port { right: 16px; bottom: 16px; } }
      </style>
      <button class="port" type="button" aria-label="Pass context to another agent"><span class="port-glyph">↔</span></button>
      <div class="backdrop" aria-hidden="true">
        <section class="panel" role="dialog" aria-label="PassOn context port" tabindex="-1">
          <div class="head">
            <span class="mark">↔</span>
            <span class="brand"><strong>PASS ON</strong><span>Context port</span></span>
            <span class="mode">LOCAL RELAY</span>
            <button class="close" type="button" aria-label="Close">×</button>
          </div>
          <div class="body">
            <div>
              <p class="label">BORROW INTO</p>
              <div class="destinations">
                <button class="destination" data-target="codex" type="button">&lt;/&gt; Codex</button>
                <button class="destination selected" data-target="claude" type="button">✦ Claude</button>
                <button class="destination" data-target="cursor" type="button">↖ Cursor</button>
              </div>
            </div>
            <div class="space">
              <div class="space-head"><p class="label">TRANSFER SPACE</p><span class="space-tag">CAMP / H2</span></div>
              <div class="route">
                <div class="node"><span class="node-icon">▣</span><span class="node-name source-name">User 1</span></div>
                <div class="lineage"><i></i><b>→</b><i></i></div>
                <div class="node"><span class="node-icon pod-icon">⬡</span><span class="node-name pod-name">Work pod</span></div>
                <div class="lineage"><i></i><b>→</b><i></i></div>
                <div class="node"><span class="node-icon target-glyph">✦</span><span class="node-name target-name">Claude</span></div>
              </div>
            </div>
            <div class="context">
              <div class="context-top"><p class="label">BOUNDED CONTEXT</p><span class="context-size"></span></div>
              <p class="objective"></p>
              <p class="preview"></p>
            </div>
            <button class="primary" type="button"><span class="primary-label">Create work pod + link</span></button>
            <div class="result"><button class="copy" type="button">Copy link</button><button class="open-link" type="button">Open receiver</button></div>
            <div class="receipt"><span class="state-dot"></span><span class="state">NOT SENT</span><span class="digest"></span></div>
            <p class="status">Nothing leaves this page until you create the handoff link.</p>
          </div>
        </section>
      </div>`;
  }
}

customElements.define("passon-button", PassOnButton);
