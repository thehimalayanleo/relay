import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allowedRequestOrigin, publicOrigin, sessionLinks, SessionRateLimiter } from "../src/host-security.mjs";

function request(origin, host = "relay-host:4317") {
  return { headers: { origin, host } };
}

test("origin validation allows same-origin and configured Tailscale origin only", () => {
  const url = new URL("http://relay-host:4317/v1/sessions");
  assert.equal(allowedRequestOrigin(request("http://relay-host:4317"), url).allowed, true);
  assert.equal(allowedRequestOrigin(request("http://ajinkya-tail:4317"), url, "", "http://ajinkya-tail:4317").allowed, true);
  assert.equal(allowedRequestOrigin(request("https://attacker.example"), url, "", "http://ajinkya-tail:4317").allowed, false);
  assert.equal(publicOrigin("http://ajinkya-tail:4317/"), "http://ajinkya-tail:4317");
});

test("rate limiting is scoped by session", () => {
  let now = 1_000;
  const limiter = new SessionRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
  limiter.check("session-a");
  limiter.check("session-a");
  assert.throws(() => limiter.check("session-a"), { code: "RATE_LIMITED" });
  assert.doesNotThrow(() => limiter.check("session-b"));
  now += 1_001;
  assert.doesNotThrow(() => limiter.check("session-a"));
});

test("public URL controls the collaborator invite without changing the host URL", () => {
  const links = sessionLinks({
    id: "12345678-1234-1234-1234-123456789abc",
    token: "capability-test",
    hostOrigin: "http://127.0.0.1:4317",
    inviteOrigin: "http://ajinkya-tail:4317",
  });
  assert.equal(links.hostWorkspaceUrl, "http://127.0.0.1:4317/demo/greptile#session=12345678-1234-1234-1234-123456789abc&token=capability-test&role=swe");
  assert.equal(links.pmInviteUrl, "http://ajinkya-tail:4317/demo/greptile#session=12345678-1234-1234-1234-123456789abc&token=capability-test&role=pm");
  assert.equal(links.collaboratorInviteUrl, "http://ajinkya-tail:4317/demo/greptile#session=12345678-1234-1234-1234-123456789abc&token=capability-test&role=collaborator");
  assert.equal(links.agentUrl, "http://ajinkya-tail:4317/demo/greptile#session=12345678-1234-1234-1234-123456789abc&token=capability-test&role=agent");
});

test("browser bundle contains no provider credentials or provider API authorization", async () => {
  const browser = await readFile(new URL("../public/greptile-demo.js", import.meta.url), "utf8");
  for (const forbidden of ["SAIL_API_KEY", "GREPTILE_API_KEY", "RELAY_AGENT_ARGV", "api.greptile.com", "@sailresearch/sdk"]) {
    assert.equal(browser.includes(forbidden), false, forbidden);
  }
});

test("browser send path seals context before queuing the host agent", async () => {
  const browser = await readFile(new URL("../public/greptile-demo.js", import.meta.url), "utf8");
  const checkpoint = browser.indexOf("/checkpoints`");
  const greptileReview = browser.indexOf("/greptile/review`");
  const agentRun = browser.indexOf("/agent/run`");
  assert.ok(checkpoint > 0);
  assert.ok(greptileReview > checkpoint);
  assert.ok(agentRun > checkpoint);
});

test("browser renders the host integration trace", async () => {
  const [browser, page] = await Promise.all([
    readFile(new URL("../public/greptile-demo.js", import.meta.url), "utf8"),
    readFile(new URL("../public/greptile-demo.html", import.meta.url), "utf8"),
  ]);
  assert.match(browser, /renderTrace/);
  assert.match(page, /id="live-trace"/);
  assert.match(page, /JetBrains\+Mono/);
  assert.match(page, /id="repo-connection"/);
  assert.match(page, /id="greptile-stage"/);
  assert.match(page, /Findings ↑/);
  assert.match(page, /Review iteration →/);
  assert.match(page, /id="preview-session" target="_blank"/);
  assert.match(browser, /renderRepository/);
  assert.doesNotMatch(browser, /window\.open\(/);
  assert.match(browser, /GitHub workspace search is unavailable/);
  assert.match(browser, /location\.assign\(created\.creatorUrl\)/);
});
