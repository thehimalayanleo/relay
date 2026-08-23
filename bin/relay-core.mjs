#!/usr/bin/env node

import { createRelayServer } from "../src/server.mjs";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4317);
const publicUrl = process.env.RELAY_PUBLIC_URL ?? "";
const server = await createRelayServer({ publicUrl });

server.listen(port, host, () => {
  console.log(`Relay listening at http://${host}:${port}`);
  if (host === "0.0.0.0") {
    if (publicUrl) console.log(`Collaborator base URL: ${publicUrl}/demo/greptile`);
    else console.log(`Warning: set RELAY_PUBLIC_URL=http://<tailscale-name>:${port} before sharing invitations.`);
  }
});
