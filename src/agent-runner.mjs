import { spawn } from "node:child_process";
import { createAgentResult } from "./workpods.mjs";

const MAX_OUTPUT_BYTES = 1_000_000;

function configuredArgv(value = process.env.PASS_ON_AGENT_ARGV) {
  if (!value) return null;
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PASS_ON_AGENT_ARGV must be a JSON array of command arguments.");
  }
  if (!Array.isArray(parsed) || !parsed.length || parsed.some((item) => typeof item !== "string" || !item)) {
    throw new Error("PASS_ON_AGENT_ARGV must be a non-empty JSON string array.");
  }
  return parsed;
}

function boundedAppend(chunks, chunk, state) {
  if (state.bytes >= MAX_OUTPUT_BYTES) return;
  const remaining = MAX_OUTPUT_BYTES - state.bytes;
  const kept = chunk.subarray(0, remaining);
  chunks.push(kept);
  state.bytes += kept.length;
}

export class ConfiguredAgentRunner {
  constructor(options = {}) {
    this.argv = options.argv ?? configuredArgv();
    this.harness = options.harness ?? process.env.PASS_ON_AGENT_HARNESS ?? "configured-agent";
    this.timeoutMs = options.timeoutMs ?? Number(process.env.PASS_ON_AGENT_TIMEOUT_MS ?? 900_000);
    this.spawnImpl = options.spawnImpl ?? spawn;
  }

  status() {
    return {
      configured: Boolean(this.argv),
      harness: this.harness,
      transport: this.argv?.[0] === "ssh" ? "ssh" : "process",
    };
  }

  async run(prompt) {
    if (!this.argv) {
      const error = new Error("No autonomous harness is configured. Set PASS_ON_AGENT_ARGV to a JSON argv array.");
      error.code = "AGENT_NOT_CONFIGURED";
      throw error;
    }
    const started = Date.now();
    const child = this.spawnImpl(this.argv[0], this.argv.slice(1), {
      env: process.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    child.stdout.on("data", (chunk) => boundedAppend(stdout, chunk, stdoutState));
    child.stderr.on("data", (chunk) => boundedAppend(stderr, chunk, stderrState));
    child.stdin.end(prompt);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, this.timeoutMs);
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    }).finally(() => clearTimeout(timer));

    const result = createAgentResult({
      harness: this.harness,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      exitCode,
      durationMs: Date.now() - started,
    });
    if (timedOut) result.timedOut = true;
    return result;
  }
}
