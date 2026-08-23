import { randomUUID } from "node:crypto";

export class AgentRunQueue {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.queues = new Map();
  }

  state(key) {
    if (!this.queues.has(key)) this.queues.set(key, { active: null, waiting: [], tail: Promise.resolve(), completed: 0 });
    return this.queues.get(key);
  }

  status(key) {
    const state = this.state(key);
    return {
      mode: "serialized",
      active: state.active,
      waiting: state.waiting.map(({ id, target, requestedBy, queuedAt }) => ({ id, target, requestedBy, queuedAt })),
      completed: state.completed,
    };
  }

  enqueue(key, metadata, task) {
    const state = this.state(key);
    const job = {
      id: randomUUID(),
      target: metadata.target ?? "generic",
      requestedBy: metadata.requestedBy ?? "api",
      queuedAt: this.now().toISOString(),
    };
    state.waiting.push(job);
    const run = async () => {
      state.waiting = state.waiting.filter((item) => item.id !== job.id);
      state.active = { ...job, startedAt: this.now().toISOString() };
      try {
        return await task({ ...state.active });
      } finally {
        state.active = null;
        state.completed += 1;
      }
    };
    const result = state.tail.then(run, run);
    state.tail = result.catch(() => {});
    return result;
  }
}

