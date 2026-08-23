# PassOn architecture

## Product boundary

PassOn is the transfer layer between a human-agent loop and its next operator. It is not a new coding harness, a shared chat room, or a replacement for source control.

The transferable unit has two parts:

1. A sealed continuation capsule containing the objective, verified state, decisions, constraints, artifacts, and next safe action.
2. An optional work pod containing the materialized files needed to continue the task.

The current demo uses a local work-pod provider. A production adapter can map the same lifecycle to a Sailbox or another persistent agent computer.

```text
Developer 1 + agent
        |
        | one-button checkpoint
        v
PassOn capsule + work pod
        |
        | capability link
        v
Developer 2 or standalone agent
```

## Current stack

| Layer | Technology | Why |
| --- | --- | --- |
| Embedded UI | Standards-based Web Component, Shadow DOM, HTML, CSS, vanilla JavaScript | One script tag works across React, Vue, static apps, and agent harnesses without inheriting host styles. |
| API | Node.js 20+, native HTTP, ECMAScript modules | Small deployment surface and a portable harness API. |
| Protocol | `passon/v1` canonical JSON capsule with a SHA-256 digest | Portable, deterministic, and independently verifiable. |
| Work pod | Local filesystem or private Sailbox via `@sailresearch/sdk` | Gives people and agents both machine-readable state and a persistent remote CPU. |
| Access | Random 256-bit capability link, fragment-carried token, hashed token at rest, expiry | Keeps the prototype account-free while avoiding public identifiers and server logs containing raw tokens. |
| Storage | Local JSON and filesystem provider | Makes the lifecycle inspectable. This is replaceable, not the production storage recommendation. |
| Harness adapters | Codex, Claude Code, Cursor, generic agent, and human renderers | The protocol stays vendor-neutral while each recipient receives a useful resume format. |
| Agent control surface | Node CLI, JavaScript client, and configured argv runner | Agents can create, pull, render, accept, terminate, and continue handoffs without automating the UI. |
| Verification | Node's built-in test runner and end-to-end HTTP tests | No test framework dependency and complete API-path coverage. |

## One-button integration

The host application supplies its current checkpoint as JSON and mounts one custom element:

```html
<script type="module" src="https://passon.example/passon-button.js"></script>
<script id="current-checkpoint" type="application/json">{"title":"..."}</script>
<passon-button endpoint="https://passon.example" source="#current-checkpoint"></passon-button>
```

The component remains a 54-pixel port until selected. It then shows the transfer route, lets the operator choose the receiving harness, seals the capsule, creates the optional work pod, and copies one capability link.

## Sailbox lifecycle

The provider interface in `src/workpods.mjs` separates PassOn from the compute vendor. The Sail-backed provider:

1. Creates a private Sailbox on the backend.
2. Write the CAMP bundle and approved workspace artifacts into the VM.
3. Pause or checkpoint the VM while the handoff is waiting.
4. Resume it only after the recipient presents the capability and passes team authorization.
5. Terminates it when the capability holder requests cleanup.

Sail credentials stay on the backend. Only Sailbox identifiers, lifecycle state, and file paths enter PassOn records.

## No-human loop

`ConfiguredAgentRunner` starts one server-approved argv command with no shell and sends the rendered continuation prompt over stdin. This means the adapter can call a local harness or `ssh 5090 ...` without allowing the recipient to inject a command. The stdout, stderr, exit status, and timing are stored back in the work pod.

## Production gaps

Before a cross-company or internet-facing deployment, add team identity, recipient authorization, revocation, encrypted managed storage, policy-aware redaction, immutable audit records, rate limits, artifact allowlists, and measured cross-model resume fidelity.
