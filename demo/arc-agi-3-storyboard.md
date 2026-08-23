# PassOn ARC-AGI-3-like workflow demo

> **Evidence boundary:** This is a workflow simulation built around an invented ARC-AGI-3-like interactive puzzle. It is not an official ARC task, ARC submission, ARC score, or evidence of puzzle-solving capability. Any screens labeled `SIMULATED` are illustrative. Commands labeled `LIVE` demonstrate PassOn transport only.

## The 75-second story

| Time | Screen | Action | Evidence label | Voiceover |
| --- | --- | --- | --- | --- |
| 0:00-0:08 | Split title: Docker on the left, macOS on the right | Show the invented grid and two actors | `SIMULATED PUZZLE` | "Long-running agent work gets trapped inside one person's environment." |
| 0:08-0:20 | User 1, Docker | Reveal a short action trace: cyan toggles gates, two moves lost lives, purple remains unknown | `SIMULATED OBSERVATIONS` | "User 1 and an agent learn part of the environment, but they have not solved it." |
| 0:20-0:30 | PassOn button | Select the orange button and create a work pod | `LIVE PASSON TRANSFER` | "One button seals the goal, observations, rejected actions, uncertainty, and next safe move." |
| 0:30-0:40 | Transfer space | Animate Docker to Sailbox to macOS | `LIVE SAILBOX HANDOFF` | "The checkpoint is written into a persistent Sailbox and paused for the next operator." |
| 0:40-0:55 | User 2, macOS | Open the capability link, pull the capsule, and restate the mechanics | `LIVE RECIPIENT PULL` | "User 2 resumes from the checkpoint without replaying the whole conversation." |
| 0:55-1:06 | Optional terminal on 5090 | Trigger the configured autonomous harness and show a proposed next action returning to the pod | `OPTIONAL HARNESS DEMO`, `NO ARC SCORE` | "The same handoff can go to a human or to an operator-configured model on a 5090." |
| 1:06-1:15 | Receipt and close | Record acceptance, then show the orange button and repository install command | `LIVE PASSON RECEIPT` | "The recipient confirms what they understood and owns the next action. The work loop moves, not just the transcript." |

## Roles and systems

```text
User 1 + agent in Docker
        |
        | one-button handoff
        v
PassOn Core -> private Sailbox -> capability link
                                  |
                                  +-> User 2 + Codex on macOS
                                  |
                                  +-> optional Qwen3-Coder harness on 5090
```

The capability link authorizes access to this one transfer. The Sail API key remains only in the PassOn backend. Neither the browser nor the capsule should contain it.

## Recording setup

Start PassOn Core on the Mac with the Sail key already in Keychain:

```bash
cd passon
SAIL_API_KEY="$(security find-generic-password -a "$USER" -s passon-sail-api-key -w)" npm run start:sail
node bin/passon.mjs doctor
```

Expected evidence for a live Sail recording: `doctor` reports `provider: "sail"`. Blur capability tokens, Sailbox identifiers, usernames, hostnames, and any terminal history that may contain credentials.

For the Docker side, mount the repository and point the CLI at the host service:

```bash
docker run --rm -it \
  -v "$PWD":/workspace \
  -w /workspace \
  -e PASS_ON_SERVER=http://host.docker.internal:4317 \
  node:20-bookworm bash
```

Inside the container:

```bash
node bin/passon.mjs doctor
node bin/passon.mjs create demo/arc-agi-3-scenario.json --pod --quiet
```

Capture the returned capability URL in a local shell variable or paste it directly into the approved channel. Do not include the token in the published video.

## User 2 on macOS

With the private link available as `PASS_ON_LINK`:

```bash
node bin/passon.mjs pull "$PASS_ON_LINK" --target codex
node bin/passon.mjs accept "$PASS_ON_LINK" \
  --actor user-2 \
  --harness codex \
  --goal "Continue the simulated puzzle from the verified checkpoint" \
  --first-action "Compare the live state, then isolate the purple tile"
```

The visible proof is not that the puzzle was solved. The proof is that User 2 receives the same goal, completed observations, rejected actions, uncertainties, next action, and work-pod files.

## Optional no-human continuation on the 5090

This shot is optional. Configure the harness only on the PassOn backend:

```bash
export PASS_ON_AGENT_HARNESS=qwen3-coder-5090
export PASS_ON_AGENT_ARGV='["ssh","5090","python3","/home/ajinkya/passon_agent.py"]'
```

Then trigger the continuation:

```bash
node bin/passon.mjs agent "$PASS_ON_LINK" --target generic
```

Show the returned artifact as an `AGENT PROPOSAL`. Do not show it as a correct move unless a separate live environment verifies it. Do not attach an ARC score.

## On-screen evidence labels

Use these exact labels so a fast viewer cannot confuse the transport demo with benchmark evidence:

- `WORKFLOW SIMULATION`
- `INVENTED ARC-AGI-3-LIKE PUZZLE`
- `LIVE PASSON TRANSFER`
- `LIVE SAILBOX HANDOFF`
- `LIVE RECIPIENT PULL`
- `OPTIONAL 5090 HARNESS`
- `AGENT PROPOSAL, NOT VERIFIED`
- `NO ARC SCORE OR BENCHMARK CLAIM`

## Capture checklist

- Confirm `doctor` reports the Sail provider before recording the live transfer.
- Keep the PassOn server reachable from both Docker and the Mac browser.
- Use a fresh handoff so the video does not expose an old capability.
- Record the orange button, Sailbox transition, recipient pull, and acceptance receipt.
- Crop or blur the capability URL and remote machine details.
- Terminate the demo Sailbox after capture with `node bin/passon.mjs terminate "$PASS_ON_LINK"`.
- If any live step fails, label that take `PARTIAL` or `BLOCKED`. Do not substitute a mocked success without labeling it.

