cask "relay" do
  version "0.1.0"
  sha256 :no_check

  url "https://github.com/thehimalayanleo/relay/releases/download/v#{version}/Relay-macOS.zip",
      header: [
        "Accept: application/octet-stream",
        "Authorization: Bearer #{ENV.fetch("HOMEBREW_GITHUB_API_TOKEN", "")}",
      ]
  name "Relay"
  desc "One-button handoffs for active work"
  homepage "https://github.com/thehimalayanleo/relay"

  depends_on macos: ">= :sonoma"

  app "Relay.app"

  caveats <<~EOS
    This private preview is not Developer ID signed or notarized.
    On first launch, open Finder, Control-click Relay, then choose Open.

    The button connects to Relay at http://127.0.0.1:4317.
    Install the CLI formula and start it with: brew services start relay
  EOS
end
