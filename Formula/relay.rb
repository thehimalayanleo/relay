class Relay < Formula
  desc "Carry active work between people and AI agents"
  homepage "https://github.com/thehimalayanleo/relay"
  url "https://github.com/thehimalayanleo/relay/archive/8670458.tar.gz"
  version "0.1.0"
  sha256 "e33f7e84a49c3b3ed2379f9d70747a507346e46131cc094c8e926dbd63f3bde0"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  service do
    run [opt_bin/"relay", "serve"]
    keep_alive true
    working_dir var/"relay"
    log_path var/"log/relay.log"
    error_log_path var/"log/relay.log"
    environment_variables RELAY_DATA_DIR: var/"relay/data",
                          RELAY_POD_DIR:  var/"relay/pods"
  end

  def caveats
    <<~EOS
      Relay starts with the local workspace provider when run as a Homebrew service.

      For Sail, stop the service and run Relay with backend-only credentials:
        brew services stop relay
        RELAY_WORK_POD_PROVIDER=sail SAIL_API_KEY="..." relay serve

      Host setup:
        relay configure
        relay serve --host 0.0.0.0 --public-url http://<tailscale-name>:4317

      Collaborators only open the generated invite link. They need no installation or keys.

      Never put SAIL_API_KEY in a handoff, URL, browser field, or capsule.
    EOS
  end

  test do
    assert_match "Relay CLI", shell_output("#{bin}/relay --help")
  end
end
