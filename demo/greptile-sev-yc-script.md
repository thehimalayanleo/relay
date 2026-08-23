# Relay x Greptile: YC demo script

## YC one-liner

Relay lets a production incident move between engineers and AI agents without losing the investigation state.

## The problem

When an engineering investigation crosses people or agents, every new participant starts cold. They reread logs, rediscover the same code paths, retry rejected fixes, and spend tokens rebuilding context that the previous human-agent pair already learned.

The durable asset is not the transcript. It is the current work state: the suspected change, relevant code paths, evidence, decisions, failed approaches, constraints, artifacts, and next safe action.

## The product

Relay is a one-button continuation layer for long-running engineering work. It seals the useful state from the current human-agent loop, stores it in a private Sailbox, and gives the next engineer or autonomous agent a scoped capability to resume the same investigation. Relay works across Codex, Claude, Cursor, CLI harnesses, and A2A-compatible agents.

## Why Greptile is central

Greptile is the code-intelligence trigger and evidence source. Relay is the continuity and execution layer.

Greptile understands the repository and flags a high-confidence defect in a pull request, or helps the first responder map a production alert to the relevant code path and recent change. Relay captures that finding together with the live investigation state, then carries it across people, agents, and machines until the incident is resolved.

Do not portray Greptile as the pager. The honest flow is:

1. A bug report, test failure, or Greptile review opens an investigation.
2. Greptile identifies the relevant code path, risky change, and repository-level evidence.
3. User 1 and an agent investigate, test a hypothesis, and reject an unsafe fix.
4. Relay seals Greptile's finding plus the human-agent investigation into a private Sailbox.
5. User 2 or an autonomous agent resumes with the same digest and next safe action.
6. The fix returns as a PR, where Greptile reviews the patch and closes the loop.

## 60-second product demo

### 0:00 to 0:08: Greptile finds the risk

Show a Greptile review on a checkout parser change:

> High confidence: this fallback accepts malformed merchant payloads and bypasses the validation path used by retry workers.

Show the repository-wide evidence and affected call path. Label it `GREPTILE FINDING`.

Voice-over:

"Greptile catches a repository-level defect in checkout code and shows the exact call path that makes it dangerous."

### 0:08 to 0:20: The incident becomes long-horizon

Show User 1 with Codex, a failing production fixture, and two investigation facts:

- Schema-wide relaxation was rejected because it changes the public API.
- The targeted parser test passes, but the full checkout suite remains.

Voice-over:

"The first engineer and agent make progress, but the useful state now spans Greptile's finding, production evidence, a rejected fix, and the next safe test. That state is trapped in one work loop."

### 0:20 to 0:34: Relay the work

Open the native orange Relay button. The header must visibly report `SAIL`. Show:

`Greptile → User 1 + Agent → Work pod → User 2`

Click `Copy link`. The status changes to `SHARED`, and the app reports `Handoff link and work pod copied.`

Voice-over:

"Relay seals the Greptile evidence and the live human-agent investigation into a private Sailbox. It passes a scoped continuation, not an entire laptop and not a raw transcript."

### 0:34 to 0:49: Resume without a cold start

Show User 2 pull the same digest. Display `CAMP.json`, `HANDOFF.md`, the next action, and an acceptance receipt. Then run the targeted test.

Voice-over:

"The next engineer or agent resumes at the frontier of the work. It knows what Greptile found, what was tried, what cannot change, and exactly what to run next."

### 0:49 to 1:00: Close the loop

Show the proposed fix returning as a pull request and Greptile reviewing the patch.

Voice-over:

"The fix returns to Greptile for review, closing the loop from code intelligence to coordinated execution. Relay turns repository understanding into shared operational memory."

End card:

`RELAY`

`Move the work loop, not just the chat.`

`Greptile finds the risk. Relay gets it resolved.`

## YC application answer

Engineers increasingly work in human-agent pairs, but those pairs are isolated inside one developer's machine and conversation. When a production incident lasts hours or crosses teams, the next engineer and agent must reconstruct the investigation from logs, chats, and code, repeating work and reloading thousands of tokens.

Relay makes the human-agent work loop transferable. With one button, an engineer seals the current objective, repository evidence, decisions, rejected approaches, artifacts, and next safe action into a private Sailbox. A second engineer or autonomous agent can resume the same verified state from Codex, Claude, Cursor, the CLI, or an A2A-compatible harness.

Our Greptile integration makes the wedge concrete. Greptile supplies repository-level findings and code paths; Relay combines them with live incident evidence and carries the work across responders until the fix returns to Greptile as a reviewed pull request. The result is faster ownership transfer, less repeated investigation, and less context reloading across agents.

## What to measure

- Time from handoff to the recipient's first correct action.
- Repeated investigation steps avoided.
- Tokens required to cold-start a new agent versus resume from Relay.
- Percentage of Greptile findings that retain evidence and decisions through resolution.
- Time from the initial finding to a reviewed fix.

Do not claim savings until the demo harness records them.
