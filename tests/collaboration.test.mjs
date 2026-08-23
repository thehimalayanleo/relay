import assert from "node:assert/strict";
import test from "node:test";
import { CollaborationHub } from "../src/collaboration.mjs";

test("two roles share one versioned product brief", () => {
  const hub = new CollaborationHub({ now: () => new Date("2026-08-23T20:00:00Z") });
  hub.join("demo", { id: "pm", name: "Sanjana", role: "Product Manager" });
  hub.join("demo", { id: "swe", name: "Ajinkya", role: "SWE" });
  const result = hub.update("demo", {
    actor: "Sanjana",
    actorId: "pm",
    field: "constraint",
    value: "Keep the Relay button orange and one-click.",
  });
  assert.equal(result.version, 1);
  assert.equal(result.participants.length, 2);
  assert.equal(result.brief.constraint, "Keep the Relay button orange and one-click.");
  assert.equal(result.activity[0].actor, "Sanjana");
  assert.equal(result.participants.find((person) => person.id === "pm").activeField, "constraint");
});

test("rapid typing coalesces activity while preserving every version", () => {
  const hub = new CollaborationHub();
  hub.join("demo", { id: "swe", name: "Ajinkya", role: "SWE" });
  hub.update("demo", { actor: "Ajinkya", actorId: "swe", field: "implementation", value: "Add live" });
  const result = hub.update("demo", { actor: "Ajinkya", actorId: "swe", field: "implementation", value: "Add live cursors" });
  assert.equal(result.version, 2);
  assert.equal(result.activity.length, 1);
  assert.equal(result.brief.implementation, "Add live cursors");
});

test("unknown shared fields are rejected", () => {
  const hub = new CollaborationHub();
  assert.throws(() => hub.update("demo", { field: "secrets", value: "no" }), /Unknown shared field/);
});
