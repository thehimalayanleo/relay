# Relay product focus

## The wedge

Relay is for handing off unfinished production-incident work between human-agent pairs.

The buyer is a platform, developer productivity, or engineering team. The moment of use is an ownership change during a long-running investigation. The recipient should begin with the relevant evidence, decisions, constraints, failed approaches, and next safe action, without replaying the source chat.

The shortest accurate pitch is:

> Relay lets incident-response teams transfer an active human-agent investigation without losing the evidence, decisions, or next action.

For the Greptile relationship:

> Greptile understands the code. Relay preserves the work required to act on that understanding.

## What Relay is

- A bounded, expiring, provenance-backed operational-memory handoff.
- A transport contract shared by a CLI, macOS button, browser receiver, and agent adapters.
- A verified receipt that records what the next operator understood and will do first.
- An optional Sailbox containing the CAMP bundle and later agent results.

## What Relay is not

- A replacement for Greptile, Claude-Mem, Letta, or a coding agent.
- A transcript-sharing product.
- A repository or VM checkpoint today.
- Evidence that a task will resolve faster merely because a capsule transferred successfully.
- A live Greptile integration until a real Greptile artifact enters through a documented connector.

## Falsifiable product hypothesis

For interrupted incident investigations, a Relay capsule will reduce time to first correct action and repeated work compared with an equal-token strong generated summary.

Freeze the comparison before testing:

1. Use the same incident, repository state, recipient model, tools, and token budget.
2. Compare fresh start, raw transcript, equal-token strong summary, and Relay.
3. Score task success, time to first correct action, repeated actions, false inherited claims, duplicate side effects, input tokens, and wall-clock time.
4. Preserve failed trials and report confidence intervals. Do not tune the capsule after seeing outcomes.

Until this experiment is run, the supported claim is transfer integrity and typed memory restoration, not token or resolution-time savings.

## Demo discipline

The demo should show only one story: User 1 and an agent investigate an engineering problem, Relay seals the useful work state into a local pod or Sailbox, and User 2 resumes and accepts the next action.

Keep A2A, autonomous 5090 execution, ARC tasks, and cost modeling outside the primary 60-second path. They are architecture extensions, not the product wedge.
