import assert from "node:assert/strict";
import test from "node:test";
import { CollaborationHub } from "../src/collaboration.mjs";

test("two roles share one versioned product brief", () => {
  const hub = new CollaborationHub({ now: () => new Date("2026-08-23T20:00:00Z") });
  hub.join("demo", { id: "pm", name: "Sanjana", role: "Product Manager" });
  hub.join("demo", { id: "swe", name: "Ajinkya", role: "SWE" });
  const result = hub.update("demo", {
    actor: "Sanjana",
    field: "constraint",
    value: "Keep the Relay button orange and one-click.",
  });
  assert.equal(result.version, 1);
  assert.equal(result.participants.length, 2);
  assert.equal(result.brief.constraint, "Keep the Relay button orange and one-click.");
  assert.equal(result.activity[0].actor, "Sanjana");
});

test("unknown shared fields are rejected", () => {
  const hub = new CollaborationHub();
  assert.throws(() => hub.update("demo", { field: "secrets", value: "no" }), /Unknown shared field/);
});
