# Relay protocol v1

Relay transfers responsibility for an active objective. A valid transfer is more than exporting text: the sender seals a canonical state, the receiver verifies its integrity, and the receiver records what they understood before continuing.

## Lifecycle

`sealed -> accepted -> superseded`

The prototype implements `sealed` and `accepted`. A production implementation should add revocation and explicit supersession while preserving the original record for audit.

## Required capsule contract

A capsule must contain:

- `title`: a human-readable label.
- `goal`: the active objective that survives the transfer.
- `nextAction`: the next action that is safe given the recorded evidence.

The normalized v1 capsule also records acceptance criteria, three-valued work status, decisions, constraints, rejected approaches, open questions, artifacts, validation, side effects, a trace summary, stop conditions, source provenance, and the intended recipient.

The JSON transport contract is in `schema/relay-v1.schema.json`.

## Invariants

1. One capsule has one canonical SHA-256 digest. Harness-specific prompts are projections of that capsule.
2. The server never stores the plaintext capability token.
3. A recipient must present the capability and observe the canonical digest before accepting.
4. Acceptance records the recipient's restated goal and intended first action.
5. Potential credential material fails closed before persistence.
6. Expired capsules cannot be read, rendered, or accepted.
7. The service has no enumeration endpoint.
8. Validation status remains explicit. A failed or blocked check is never promoted into completion.

## Harness contract

A sender integration should:

1. Pause at a safe boundary.
2. Collect state from the workspace, trace, and environment.
3. Mark each claim by evidence status.
4. Call `POST /v1/relays`.
5. Share the returned capability URL.

A receiver integration should:

1. Fetch the canonical capsule.
2. Verify the digest and referenced external state.
3. Render or natively load the capsule into the target harness.
4. Restate the goal, constraints, state, and first action.
5. Call the acceptance endpoint before resuming mutations.

Skills, plugins, IDE extensions, and agent-specific commands should implement this contract as adapters. They should not create independent handoff formats.

## Missing production controls

Capability URLs are suitable for local demos and trusted pilot networks, not broad deployment. Production needs identity, authorization, revocation, encrypted storage, policy-aware redaction, rate limiting, immutable audit logs, and scoped delegation for repositories and external tools.
