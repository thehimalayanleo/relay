from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class Observation:
    step: int
    state: str
    available_actions: tuple[str, ...]
    levels_completed: int = 0


class Environment(Protocol):
    def reset(self) -> Observation: ...
    def step(self, action: str) -> Observation: ...


class ResumableEnvironment(Environment, Protocol):
    """An environment whose internal state can be restored from an observation."""

    def restore(self, observation: Observation) -> None: ...


@dataclass
class Memory:
    hypothesis: str = "The environment rules are unknown."
    confirmed: list[str] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)
    next_probe: str = "Try an available action and compare the result."


@dataclass
class Episode:
    run_id: str
    game_id: str
    action_budget: int
    actions: list[str] = field(default_factory=list)
    observations: list[dict] = field(default_factory=list)
    memory: Memory = field(default_factory=Memory)
    status: str = "running"

    @property
    def remaining_actions(self) -> int:
        return max(0, self.action_budget - len(self.actions))

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict) -> "Episode":
        value = dict(value)
        value["memory"] = Memory(**value.get("memory", {}))
        return cls(**value)


class CheckpointStore:
    def __init__(self, path: Path):
        self.path = path

    def save(self, episode: Episode) -> str:
        payload = json.dumps(episode.to_dict(), indent=2, sort_keys=True)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(payload + "\n", encoding="utf-8")
        temp.replace(self.path)
        return hashlib.sha256(payload.encode()).hexdigest()

    def load(self) -> Episode:
        return Episode.from_dict(json.loads(self.path.read_text(encoding="utf-8")))


class Policy(Protocol):
    def choose(self, observation: Observation, memory: Memory) -> tuple[str, Memory]: ...


class LongHorizonRunner:
    def __init__(self, env: Environment, policy: Policy, store: CheckpointStore):
        self.env = env
        self.policy = policy
        self.store = store

    def run(self, episode: Episode, *, max_steps: int | None = None) -> Episode:
        observation = self.env.reset()
        if episode.observations:
            observation = Observation(**episode.observations[-1])
            restore = getattr(self.env, "restore", None)
            if callable(restore):
                restore(observation)

        local_limit = episode.remaining_actions if max_steps is None else max_steps
        if episode.status == "running" and episode.remaining_actions == 0:
            episode.status = "budget_exhausted"
            self.store.save(episode)
        for _ in range(min(local_limit, episode.remaining_actions)):
            if episode.status != "running":
                break
            action, memory = self.policy.choose(observation, episode.memory)
            if action not in observation.available_actions:
                episode.status = "blocked_invalid_action"
                self.store.save(episode)
                break
            observation = self.env.step(action)
            episode.actions.append(action)
            episode.observations.append(asdict(observation))
            episode.memory = memory
            if observation.levels_completed > 0:
                episode.status = "completed"
            elif episode.remaining_actions == 0:
                episode.status = "budget_exhausted"
            self.store.save(episode)
        return episode
