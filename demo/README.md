# Two-user live demo

This is the shortest honest demo of the complete transfer loop:

```text
Docker User 1 simulated puzzle agent
  -> PassOn Core on the Mac
  -> private Sail work pod containing CAMP.json + HANDOFF.md + manifest.json
  -> capability link
  -> macOS User 2 pulls the pod and issues an acceptance receipt
```

The Docker container has no Sail key. Only PassOn Core holds `SAIL_API_KEY`. The container receives a capability URL, not infrastructure credentials. The scenario is an invented ARC-AGI-3-like workflow simulation. It carries no ARC score or benchmark claim.

## One-minute manual run

Prerequisites:

- PassOn Core is already running on port 4317 and `/health` reports the `sail` provider.
- Docker Desktop is running.
- The native macOS receiver can reach `http://127.0.0.1:4317`.

Run User 1 inside Docker:

```bash
docker compose -f demo/compose.yml run --build --rm user1
```

The container creates a one-hour work-pod handoff from `demo/arc-agi-3-scenario.json` through `host.docker.internal`, rewrites only the receiver origin for the Mac, and saves the capability to `demo/out/share-url.txt`. It never prints the capability onscreen.

Run User 2 natively on macOS:

```bash
open demo/run-user2.command
```

User 2 pulls the sealed CAMP bundle, renders it for Codex, issues a digest-bound acceptance receipt, terminates the work pod, and deletes the local capability file. The capability is never printed or opened in a browser during capture. Show the native orange PassOn button as a separate token-free shot.

## Record the MP4

The capture script prebuilds the image, opens separate User 1 and User 2 Terminal windows, records the main display, and transcodes the result with `ffmpeg`:

```bash
chmod +x demo/*.sh demo/*.command
./demo/record-demo.sh 90
```

Output:

```text
demo/out/passon-user1-docker-to-user2-macos.mp4
```

On the first run, macOS may require Screen Recording permission for the shell or Codex. Grant it under System Settings, Privacy & Security, Screen & System Audio Recording, then rerun the script.

The scripts keep the capability offscreen and terminate the work pod after User 2 accepts responsibility. If User 2 fails before cleanup, terminate it manually with the private URL stored in `demo/out/share-url.txt`.

## Why Docker plus macOS, not the 5090

Docker User 1 plus macOS User 2 proves the cross-boundary protocol with the least setup. The 5090 is useful for a second demo of autonomous continuation, where `PASS_ON_AGENT_ARGV` points at an SSH-hosted open-source model harness. It is not required to prove the human-to-human responsibility transfer.

## Fast failure checks

- `Connection refused`: PassOn Core is not running on port 4317.
- `found local-demo`: restart Core with the Sail API key and `npm run start:sail`.
- Docker cannot resolve the host: make sure Docker Desktop is running; the Compose file also maps `host.docker.internal` through `host-gateway` for Linux compatibility.
- No MP4: grant Screen Recording permission and verify `ffmpeg` is installed.
