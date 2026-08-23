#!/usr/bin/env node

import { createRelayServer } from "../src/server.mjs";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4317);
const server = await createRelayServer();

server.listen(port, host, () => {
  console.log(`Relay listening at http://${host}:${port}`);
  if (host === "0.0.0.0") {
    console.log("Warning: auth is not implemented. Put Relay behind a trusted gateway.");
  }
});
