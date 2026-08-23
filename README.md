# Relay

**Move the work loop, not just the transcript.**

[![Relay transfers a live SEV handoff from User 1 to User 2](./docs/assets/relay-sev-handoff.gif)](https://www.loom.com/share/908095a693e44b4db042c9ea254a9d9a)

*A compressed, silent preview of the full [Relay SEV demo](https://www.loom.com/share/908095a693e44b4db042c9ea254a9d9a).*

Many production bugs are not isolated coding tasks. They depend on tribal knowledge spread across teams, tools, and prior decisions, and the hardest cases can take one to three days to resolve. Coding agents make an individual developer faster, but today each agent usually works inside one person's environment with its own context, filesystem, and understanding of the task. That makes genuine parallel human-agent collaboration difficult.

PassOn makes the human-agent work loop portable. A developer can package the verified objective, decisions, constraints, artifacts, and next safe action into a bounded handoff, optionally attach a persistent work environment, and pass control to another developer or a standalone agent. The recipient resumes from the same execution state without replaying the whole chat or reconstructing the team's tribal knowledge.

PassOn is a small, vendor-neutral continuation protocol. It sends a verified checkpoint and an acceptance receipt instead of treating a chat transcript as executable state.

The current release is a local or trusted-network prototype. It has no user accounts. Every pass-on gets a random 256-bit capability URL, expires after 72 hours by default, and is stored as a private local JSON file. Put it behind an authenticated gateway before exposing it to the public internet.

## What works

- One-button web-app overlay with a copyable browser handoff link.
- HTTP API that any harness can call.
- Dependency-free JavaScript client in `src/client.mjs` for direct harness integration.
- CLI for create, fetch, render, accept, and cost estimation.
- Resume renderers for Codex, Claude Code, Cursor, generic agents, and humans.
- Canonical capsule digest and integrity verification.
- Secret-pattern rejection before a capsule is stored.
- Recipient acceptance receipts that bind to the observed digest.
- Expiring capability links with no list or search endpoint.
- Transparent cost sensitivity model and resume-evaluation scaffold.
- Real Sailbox provider that writes the CAMP bundle, pauses while waiting, resumes on pull, and terminates on request.
- Backend-configured autonomous harness runner for no-human continuation.

This is not yet a full environment checkpoint. Repository snapshots, sandbox images, delegated service capabilities, SSO, revocation, and trace-store connectors remain production work.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the stack, integration boundary, and Sailbox path.

## Run it

Requires Node.js 20 or newer.

```bash
cd passon
npm test
npm start
```

Open `http://127.0.0.1:4317`.

### Connect a real Sailbox

Create an API key in the [Sail dashboard](https://app.sailresearch.com). Keep it out of the browser, capsule, repository, and chat. On macOS, store it in Keychain:

```bash
read -s SAIL_KEY
security add-generic-password -U -a "$USER" -s passon-sail-api-key -w "$SAIL_KEY"
unset SAIL_KEY
```

Start PassOn with the key injected only into the backend process:

```bash
SAIL_API_KEY="$(security find-generic-password -a "$USER" -s passon-sail-api-key -w)" npm run start:sail
node bin/passon.mjs doctor
```

The health response should report `"provider": "sail"`. Creating a handoff with `--pod` now creates a private Sailbox, writes the three context files under `/opt/passon/handoffs/<id>`, and pauses the VM. Pulling the handoff resumes it.

The native floating button lives in [`apps/macos`](./apps/macos). It captures an explicit clipboard selection, renders it for Codex, Claude, or Cursor, and can ask PassOn Core to create the same capability link and work pod.

Create a pass-on from another harness:

```bash
node bin/passon.mjs create examples/capsule.json
```

The response contains a capability `shareUrl`. Paste it into an approved channel or pass it directly to another harness. The recipient only needs a browser.

## Agent CLI

The CLI is designed as the orchestration surface for agents and shell workflows. Structured commands emit JSON to stdout, errors use stderr and a nonzero exit code, and `--quiet` emits only the capability URL.

```bash
# Confirm that PassOn Core is reachable
node bin/passon.mjs doctor

# Turn notes or another command's output into a one-button equivalent
git diff | node bin/passon.mjs handoff - \
  --goal "Finish the parser repair" \
  --next "Run npm test and inspect failures" \
  --to codex \
  --pod \
  --quiet

# Pull the verified record, destination prompt, and work pod in one JSON response
node bin/passon.mjs pull '<share-url>' --target claude
```

Run `node bin/passon.mjs --help` for the lower-level `create`, `get`, `pod`, `render`, `accept`, and `cost` verbs.

Terminate the remote work pod when the work is finished:

```bash
node bin/passon.mjs terminate '<share-url>'
```

Render the same checkpoint for a receiving harness:

```bash
node bin/passon.mjs render '<share-url>' --target codex
node bin/passon.mjs render '<share-url>' --target claude
node bin/passon.mjs render '<share-url>' --target cursor
```

Accept responsibility and issue a receipt:

```bash
node bin/passon.mjs accept '<share-url>' \
  --actor agent-2 \
  --harness codex \
  --goal 'Fix the parser regression without changing the public API.' \
  --first-action 'Verify the workspace digest and run the targeted test.'
```

## Embed one button in any harness UI

Serve `public/passon-button.js`, place the capsule JSON in a script element, then add:

```html
<script type="module" src="https://your-passon-host/passon-button.js"></script>
<script id="current-checkpoint" type="application/json">{"title":"..."}</script>
<passon-button
  endpoint="https://your-passon-host"
  source="#current-checkpoint"
  source-app="Your agent"
  default-target="claude">
</passon-button>
```

The component renders a 54-pixel floating port over the host web app. Selecting it adds a light backdrop and a compact transfer space. One action seals the checkpoint and copies the capability link. It does not open a platform share sheet and does not require a handoff form.

## Work pods and Sailboxes

Every handoff can attach a work pod. Both the local fallback and Sail provider write three sealed files:

- `CAMP.json` for machine-readable state and lineage.
- `HANDOFF.md` for a fresh agent or person.
- `manifest.json` for lifecycle and provider metadata.

The receiver uses the same capability link to pull that pod context. This makes the demonstration `User 1 → Work Pod → User 2`, instead of pretending that a chat summary is a complete environment.

`src/workpods.mjs` is the provider boundary. `SailWorkPodProvider` creates a private persistent VM, writes the CAMP bundle through Sail's filesystem API, pauses it while the handoff waits, resumes it for the recipient, stores autonomous-agent results, and terminates it explicitly. `LocalWorkPodProvider` remains the account-free fallback. Sail credentials stay on the backend and never enter the browser capsule.

The local pod is not a remote CPU and cannot be reached from another laptop unless this service is deployed on a reachable trusted host. The Sail provider is remote compute, but the PassOn API itself still needs to be reachable by both users.

## Autonomous continuation and a 5090 model

PassOn can hand the sealed resume prompt to one operator-configured command. The capability holder chooses only the renderer, never the command. Configure the command as a JSON argv array:

```bash
export PASS_ON_AGENT_HARNESS="deepseek-5090"
export PASS_ON_AGENT_ARGV='["ssh","5090","python3","/home/ajinkya/passon_agent.py"]'
npm run start:sail
```

The harness receives the resume prompt on stdin and must write its result to stdout. This contract also works with a local model server, OpenCode, or another agent harness. Trigger it with:

```bash
node bin/passon.mjs agent '<share-url>' --target generic
```

The result is written back into the same work pod as `agents/<run-id>.json`. This is the first no-human loop. A production scheduler, cancellation API, model endpoint policy, and multi-step supervision remain future work.

Node-based harnesses can use the client directly:

```js
import { PassOnClient } from "./src/client.mjs";

const passon = new PassOnClient("http://127.0.0.1:4317");
const transfer = await passon.create(currentCheckpoint, { workPod: true });
const codexPrompt = await passon.render(transfer.shareUrl, "codex");
const resumed = await passon.pull(transfer.shareUrl, "codex");
```

The transport schema is published at `schema/passon-v1.schema.json` so non-JavaScript harnesses can implement the same contract.

## Minimal API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/passons` | Normalize, scan, seal, and store a capsule |
| `GET` | `/v1/passons/:id` | Fetch and integrity-check a capsule |
| `GET` | `/v1/passons/:id/render?target=codex` | Produce a harness-specific resume prompt |
| `GET` | `/v1/passons/:id/pod` | Pull the sealed work-pod context bundle |
| `POST` | `/v1/passons/:id/agent/run` | Run the backend-configured autonomous harness |
| `POST` | `/v1/passons/:id/pod/terminate` | Permanently terminate the attached work pod |
| `POST` | `/v1/passons/:id/accept` | Record the recipient's understanding and first action |
| `POST` | `/v1/cost-estimate` | Run the configurable unit-economics model |

Use `Authorization: Bearer <capability-token>` for recipient API calls. The receiver link carries the token in its URL fragment, so browsers do not send the capability to the server as part of the page request.

## Cost efficacy

Run:

```bash
npm run cost
```

The output deliberately separates two value sources:

1. Input-token savings from loading a compact capsule rather than a full trace.
2. Avoided recovery work when fewer resumes fail or repeat completed work.

The included scenarios are assumptions, not product results. They show that token savings alone are usually a weak business case. The product becomes economical only if measured resume fidelity reduces repeated human and agent work.

Planning-level build ranges, not vendor quotes:

- Protocol prototype: 1 to 2 engineer-weeks, roughly $5k to $20k loaded cost.
- Team pilot with two real harness integrations and evaluation: 6 to 10 engineer-weeks, roughly $50k to $150k.
- Production service with SSO, policy, revocation, encrypted artifact storage, audit, and reliability work: 3 to 6 engineer-months, roughly $150k to $500k.

To replace assumptions with evidence, run interrupted tasks under four conditions: fresh start, raw transcript, naive summary, and PassOn. Record task success, time to first correct action, input tokens, repeated actions, false inherited claims, and duplicate side effects. Put the observations in the format of `examples/eval-results.example.json`, then run:

```bash
node scripts/evaluate.mjs path/to/measured-results.json
```

Do not present the included example rows as empirical results.

## Production boundary

Before public or company-wide deployment, add:

- SSO and team authorization.
- Revocation and short-lived delegated capabilities.
- Encryption at rest and managed retention.
- Repository, sandbox, and trace-store connectors.
- Policy-aware redaction and a stronger secret scanner.
- Immutable audit logging.
- Rate limiting and abuse controls.
- A measured cross-model resume benchmark.

PassOn should remain the continuation protocol. Harness-specific skills and plugins should be thin adapters, never the source of truth.
