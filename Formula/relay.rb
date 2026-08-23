class Relay < Formula
  desc "Carry active work between people and AI agents"
  homepage "https://github.com/thehimalayanleo/passon-context-port"
  url "https://github.com/thehimalayanleo/passon-context-port.git",
      tag: "v0.1.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  service do
    run [opt_bin/"passon", "serve"]
    keep_alive true
    working_dir var/"passon"
    log_path var/"log/passon.log"
    error_log_path var/"log/passon.log"
    environment_variables PASS_ON_DATA_DIR: var/"passon/data",
                          PASS_ON_POD_DIR: var/"passon/pods"
  end

  def caveats
    <<~EOS
      Relay starts with the local workspace provider when run as a Homebrew service.

      For Sail, stop the service and run PassOn with backend-only credentials:
        brew services stop relay
        PASS_ON_WORK_POD_PROVIDER=sail SAIL_API_KEY="..." relay serve

      Never put SAIL_API_KEY in a handoff, URL, browser field, or capsule.
    EOS
  end

  test do
    assert_match "Relay CLI", shell_output("#{bin}/relay --help")
  end
end
