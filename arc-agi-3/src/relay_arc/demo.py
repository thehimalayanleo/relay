from __future__ import annotations

from dataclasses import replace

from .core import Memory, Observation


class CorridorWorld:
    """Deterministic compatibility world. This is not an ARC benchmark game."""

    def __init__(self) -> None:
        self.position = 0
        self.step_count = 0

    def reset(self) -> Observation:
        return self._observation()

    def restore(self, observation: Observation) -> None:
        self.position = int(observation.state.rsplit(":", 1)[1].split("/", 1)[0])
        self.step_count = observation.step

    def step(self, action: str) -> Observation:
        self.step_count += 1
        if action == "RIGHT":
            self.position = min(3, self.position + 1)
        elif action == "LEFT":
            self.position = max(0, self.position - 1)
        return self._observation()

    def _observation(self) -> Observation:
        return Observation(
            step=self.step_count,
            state=f"corridor:{self.position}/3",
            available_actions=("LEFT", "RIGHT"),
            levels_completed=int(self.position == 3),
        )


class HypothesisPolicy:
    def choose(self, observation: Observation, memory: Memory) -> tuple[str, Memory]:
        finding = f"RIGHT moved or kept the player at {observation.state}."
        confirmed = list(memory.confirmed)
        if observation.step > 0 and finding not in confirmed:
            confirmed.append(finding)
        updated = replace(
            memory,
            hypothesis="Repeated RIGHT actions advance through the corridor.",
            confirmed=confirmed,
            next_probe="Continue RIGHT until completion or contradiction.",
        )
        return "RIGHT", updated
