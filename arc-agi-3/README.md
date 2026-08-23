# Relay for ARC-AGI-3

One agent can stop. Another can continue.

This repository is a small, inspectable long-horizon harness for ARC-AGI-3 work. It adds durable checkpoints, explicit hypotheses, bounded action budgets, and handoff-ready episode artifacts around the official frame/action loop.

The included corridor is a deterministic compatibility demo, not an ARC-AGI-3 benchmark game and not a benchmark score.

## See the loop

```bash
python3 -m pip install -e . pytest
relay-arc demo --steps 2
relay-arc demo --resume --steps 2
```

The first process writes `artifacts/episode.json`. The next process resumes the same episode with its actions, observations, hypothesis, confirmed findings, next probe, budget, and status intact.

## Give work to Ox Alpha

Install and authenticate OpenCode Go, then run:

```bash
relay-arc ox "Inspect the checkpoint boundary. Fix one verified bug and run tests."
```

The model is pinned to `opencode-go/ox-alpha-free`. Its task is deliberately bounded to this repository.

## Official ARC-AGI-3

Set `ARC_API_KEY` and adapt `Environment` in `src/relay_arc/core.py` to the official `arc-agi` environment wrapper. The protocol boundary mirrors the official loop: observe a frame, choose an available action, step, and stop within a budget.

Reference implementation: [arcprize/ARC-AGI-3-Agents](https://github.com/arcprize/ARC-AGI-3-Agents).

## Honest claim boundary

- Demonstrated here: resumability, bounded execution, durable hypothesis memory, deterministic tests.
- Not demonstrated here: ARC puzzle performance, leaderboard score, autonomous multi-day reliability.
- Greptile findings are only called real after a review is returned on this repository's pull request.
