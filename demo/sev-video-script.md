# Relay investigation demo script

Target length: 75 seconds

## 0:00 to 0:08 | The incident

**Screen:** Investigation: `Checkout validation failures`. User 1 has Codex open beside logs and a failing test.

**Voice-over:**

“It is 2:10 AM. Checkout failures are rising, and one engineer with an agent has already spent forty minutes tracing the incident.”

## 0:08 to 0:19 | The trapped knowledge

**Screen:** Show short investigation notes: affected payload, rejected fix, public API constraint, passing targeted test, full suite still pending.

**Voice-over:**

“The useful state is not just code. It is tribal knowledge: what failed, what was ruled out, which constraint cannot move, and the next safe test. Today, that context is trapped inside one person’s agent session.”

## 0:19 to 0:31 | One-button Relay

**Screen:** Click the small orange Relay button. Show the route: User 1 → Sailbox → User 2. Click “Create work pod + link.”

**Voice-over:**

“Relay turns that live human-agent loop into a verified continuation. One click seals the objective, evidence, decisions, rejected approaches, artifacts, and next action.”

## 0:31 to 0:42 | Durable transfer

**Screen:** Show `CAMP.json`, `HANDOFF.md`, and `manifest.json` entering the Sailbox. Status changes from running to paused.

**Voice-over:**

“The checkpoint is written into a private Sailbox and paused. The API key stays on the backend. The receiver gets one bounded capability link, not somebody else’s machine or full chat history.”

## 0:42 to 0:56 | User 2 resumes

**Screen:** On macOS, User 2 opens the handoff, pulls the pod, sees the same digest, then copies the Codex resume prompt.

**Voice-over:**

“A second engineer, or a standalone agent, pulls the same sealed state. They verify the digest, restate the goal, and begin with the known next action instead of replaying the incident from scratch.”

## 0:56 to 1:07 | Parallel agent continuation

**Screen:** Show User 2 accepting responsibility. Optional: show Qwen3-Coder on the 5090 returning a proposed next test into the same pod.

**Voice-over:**

“Now the team can move responsibility across people, models, and machines. Another agent can continue autonomously, while every result returns to the same work pod for review.”

## 1:07 to 1:15 | Business close

**Screen:** Show the orange Relay button, then three labels: `Less repeated investigation`, `Less transcript replay`, `Faster ownership transfer`.

**Voice-over:**

“For the business, Relay preserves tribal knowledge, reduces repeated investigation, and avoids paying to reload entire transcripts into every new agent. Move the work loop, not just the chat.”

## Final title card

**On screen:**

`RELAY`

`One-button continuity for long-horizon human-agent work`

`Docker → Sailbox → macOS → any A2A-compatible agent`

Small evidence label: `Live workflow demonstration. No measured savings claim.`
