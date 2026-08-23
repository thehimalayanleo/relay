# Install Relay on another Mac

Relay includes a command-line tool, a small macOS button, and an optional background agent.

## One-command public install

Requires Node.js 20 or newer. No GitHub account or repository token is required:

```sh
npm install -g https://github.com/thehimalayanleo/relay/archive/refs/heads/main.tar.gz
```

Then start the local dashboard with `relay serve`. OpenCode is optional and needed only for autonomous continuation.

## Start Relay with Ox Alpha

OpenCode must already be signed in on the laptop. No additional model key is required.

```bash
export RELAY_AGENT_HARNESS='OpenCode Ox Alpha'
export RELAY_AGENT_ARGV='["opencode","run","--pure","--model","opencode-go/ox-alpha-free","--dir","'"$PWD"'"]'
relay serve
```

Open `http://127.0.0.1:4317/demo/greptile`. The page shows when the active investigation is passed forward, when Ox Alpha continues it, and when the next person receives it.

The browser can ask the preconfigured agent to continue a Relay handoff. It cannot choose a command or enable automatic permissions.

## macOS button

The CLI and web dashboard are the supported public install today. The native button can be built from source with the steps below. A one-command cask requires a notarized release artifact and is not claimed yet.

## Build locally instead

```bash
gh repo clone thehimalayanleo/relay relay
cd relay
npm ci
npm run package
npm install -g ./dist/relay-handoff-0.1.0.tgz
relay doctor
open apps/macos/dist/Relay.app
```

Release output:

- `dist/relay-handoff-0.1.0.tgz`
- `dist/Relay-macOS.zip`
- `dist/SHA256SUMS.txt`

The Homebrew cask will work after those artifacts are attached to the public `v0.1.0` GitHub release and the app is notarized.
