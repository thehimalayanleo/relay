# Install Relay on another Mac

Relay includes a command-line tool, a small macOS button, and an optional background agent.

## Fastest install from the two files

Send these two files to the other Mac:

- `relay-handoff-0.1.0.tgz`
- `Relay-macOS.zip`

Then run from the folder containing them:

```bash
npm install -g ./relay-handoff-0.1.0.tgz
ditto -x -k Relay-macOS.zip .
mv Relay.app /Applications/
relay --help
open -a Relay
```

The recipient needs Node.js 20 or newer. OpenCode is needed only for the background-agent button.

## Install from the private repository

The recipient needs access to `thehimalayanleo/passon-context-port`, Homebrew, and GitHub CLI.

```bash
gh auth login
gh auth setup-git
brew tap thehimalayanleo/relay https://github.com/thehimalayanleo/passon-context-port.git
brew install thehimalayanleo/relay/relay
relay doctor
```

## Start Relay with Ox Alpha

OpenCode must already be signed in on the laptop. No additional model key is required.

```bash
export PASS_ON_AGENT_HARNESS='OpenCode Ox Alpha'
export PASS_ON_AGENT_ARGV='["opencode","run","--pure","--model","opencode-go/ox-alpha-free","--dir","'"$PWD"'"]'
relay serve
```

Open `http://127.0.0.1:4317/demo/greptile`. The page shows when the active investigation is passed forward, when Ox Alpha continues it, and when the next person receives it.

The browser can ask the preconfigured agent to continue a Relay handoff. It cannot choose a command or enable automatic permissions.

## Install the macOS button

The private release requires a temporary GitHub token for Homebrew to download it:

```bash
HOMEBREW_GITHUB_API_TOKEN="$(gh auth token)" \
  brew install --cask thehimalayanleo/relay/relay
open -a Relay
```

This preview is ad-hoc signed, not notarized. On first launch, Control-click Relay in Finder and choose **Open**.

## Build locally instead

```bash
gh repo clone thehimalayanleo/passon-context-port relay
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

The Homebrew install will work after those artifacts are attached to the private `v0.1.0` GitHub release.
