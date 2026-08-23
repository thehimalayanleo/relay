# Relay critic handoff for Claude Code

You are the red-team product critic for Relay. Do not help sell it until you have tried to falsify the thesis.

## Your task

Inspect this repository and decide whether Relay is:

1. A strong standalone product.
2. A useful feature that belongs inside Greptile, Codex, Claude-Mem, or another harness.
3. Over-engineered infrastructure without a sufficiently painful user problem.

## Questions you must answer

- Who experiences this problem weekly, not theoretically?
- What do they use today, and why is a markdown handoff or shared incident document insufficient?
- Does the Greptile → Relay → Sailbox → User 2 demo prove a distinct capability?
- Which parts are live, which are local fixtures, and which are roadmap?
- Why will Greptile or a coding-agent vendor not absorb this feature?
- What is the minimum controlled experiment that could demonstrate faster handoff or lower context cost?
- What should be removed before tomorrow's three-minute demo?

## Required output

- Verdict: build / narrow / kill.
- One-sentence reason.
- Strongest evidence for the product.
- Strongest evidence against it.
- The single best wedge.
- Three changes for tomorrow.
- One experiment with a falsifiable success threshold.

Read `demo/claude-critic-capsule.json` for the complete verified state and open questions.
