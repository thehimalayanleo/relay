#!/usr/bin/env node

import { spawn } from "node:child_process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = Buffer.concat(chunks).toString("utf8").trim();
if (!prompt) throw new Error("Relay supplied an empty OpenCode prompt.");

const model = process.env.RELAY_OPENCODE_MODEL ?? "opencode-go/ox-alpha-free";
const requestedBy = (process.env.RELAY_AGENT_REQUESTED_BY ?? "collaborator").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
const title = `relay-${requestedBy}-${process.pid}-${Date.now()}`;
const workspace = process.env.RELAY_AGENT_CWD || process.cwd();
const child = spawn("opencode", [
  "run", "--pure", "--format", "json", "--model", model, "--title", title, "--dir", workspace, prompt,
], { cwd: workspace, env: process.env, stdio: ["ignore", "pipe", "pipe"], shell: false });

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.once("error", (error) => { throw error; });
child.once("close", (code) => { process.exitCode = code ?? 1; });
