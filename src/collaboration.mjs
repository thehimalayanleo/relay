import { randomUUID } from "node:crypto";

const DEFAULT_ROOM = "relay-product";

function cleanText(value, limit = 4_000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

export class CollaborationHub {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.rooms = new Map();
  }

  room(id = DEFAULT_ROOM) {
    const roomId = cleanText(id, 80) || DEFAULT_ROOM;
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        version: 0,
        brief: {
          problem: "Make Relay feel like one shared product workspace, not two disconnected chats.",
          constraint: "Keep the experience one-button, visual, and free of jargon-heavy forms.",
          acceptance: "Sanjana and Ajinkya see each other's changes immediately and can checkpoint durable decisions.",
          implementation: "Add synchronized presence, product notes, and an observable agent activity stream.",
        },
        activity: [],
        participants: new Map(),
        clients: new Set(),
      });
    }
    return this.rooms.get(roomId);
  }

  snapshot(room) {
    const cutoff = this.now().getTime() - 30_000;
    const participants = [...room.participants.values()].filter((person) => {
      return new Date(person.lastSeenAt).getTime() >= cutoff;
    });
    return {
      id: room.id,
      version: room.version,
      brief: room.brief,
      participants,
      activity: room.activity.slice(-30),
    };
  }

  join(roomId, participant = {}) {
    const room = this.room(roomId);
    const id = cleanText(participant.id, 100) || randomUUID();
    const existing = room.participants.get(id);
    const person = {
      id,
      name: cleanText(participant.name, 80) || existing?.name || "Collaborator",
      role: cleanText(participant.role, 80) || existing?.role || "Contributor",
      color: cleanText(participant.color, 20) || existing?.color || "#ff5a1f",
      lastSeenAt: this.now().toISOString(),
    };
    room.participants.set(id, person);
    this.broadcast(room, "presence");
    return this.snapshot(room);
  }

  update(roomId, body = {}) {
    const room = this.room(roomId);
    const field = cleanText(body.field, 40);
    if (!Object.hasOwn(room.brief, field)) throw new Error(`Unknown shared field: ${field}`);
    const value = cleanText(body.value);
    const actor = cleanText(body.actor, 80) || "Collaborator";
    room.brief = { ...room.brief, [field]: value };
    room.version += 1;
    room.activity.push({
      id: randomUUID(),
      type: "edit",
      actor,
      detail: `updated ${field}`,
      at: this.now().toISOString(),
      version: room.version,
    });
    this.broadcast(room, "workspace");
    return this.snapshot(room);
  }

  addActivity(roomId, body = {}) {
    const room = this.room(roomId);
    const event = {
      id: randomUUID(),
      type: cleanText(body.type, 40) || "agent",
      actor: cleanText(body.actor, 80) || "Relay agent",
      detail: cleanText(body.detail, 500) || "activity recorded",
      at: this.now().toISOString(),
      version: room.version,
    };
    room.activity.push(event);
    this.broadcast(room, "activity");
    return event;
  }

  subscribe(roomId, response) {
    const room = this.room(roomId);
    room.clients.add(response);
    response.write(`event: workspace\ndata: ${JSON.stringify(this.snapshot(room))}\n\n`);
    return () => room.clients.delete(response);
  }

  broadcast(room, event) {
    const message = `event: ${event}\ndata: ${JSON.stringify(this.snapshot(room))}\n\n`;
    for (const client of room.clients) {
      try { client.write(message); } catch { room.clients.delete(client); }
    }
  }
}

