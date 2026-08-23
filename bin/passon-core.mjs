#!/usr/bin/env node

import { createPassOnServer } from "../src/server.mjs";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4317);
const server = await createPassOnServer();

server.listen(port, host, () => {
  console.log(`PassOn listening at http://${host}:${port}`);
  if (host === "0.0.0.0") {
    console.log("Warning: auth is not implemented. Put PassOn behind a trusted gateway.");
  }
});
