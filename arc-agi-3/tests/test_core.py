from pathlib import Path

from relay_arc.core import CheckpointStore, Episode, LongHorizonRunner
from relay_arc.demo import CorridorWorld, HypothesisPolicy


def test_checkpoint_round_trip(tmp_path: Path) -> None:
    store = CheckpointStore(tmp_path / "episode.json")
    episode = Episode("run-1", "demo", 10)
    digest = store.save(episode)
    assert len(digest) == 64
    assert store.load() == episode


def test_runner_stops_and_checkpoints(tmp_path: Path) -> None:
    store = CheckpointStore(tmp_path / "episode.json")
    result = LongHorizonRunner(CorridorWorld(), HypothesisPolicy(), store).run(
        Episode("run-2", "demo", 10), max_steps=2
    )
    assert result.status == "running"
    assert result.actions == ["RIGHT", "RIGHT"]
    assert store.load().actions == result.actions


def test_resume_restores_environment_state(tmp_path: Path) -> None:
    store = CheckpointStore(tmp_path / "episode.json")
    first = LongHorizonRunner(CorridorWorld(), HypothesisPolicy(), store).run(
        Episode("run-4", "demo", 10), max_steps=2
    )
    assert first.status == "running"
    assert [obs["state"] for obs in first.observations] == [
        "corridor:1/3",
        "corridor:2/3",
    ]

    resumed = LongHorizonRunner(CorridorWorld(), HypothesisPolicy(), store).run(
        store.load()
    )
    assert resumed.status == "completed"
    assert resumed.actions == ["RIGHT"] * 3
    assert [obs["state"] for obs in resumed.observations] == [
        "corridor:1/3",
        "corridor:2/3",
        "corridor:3/3",
    ]
    assert resumed.observations[-1]["levels_completed"] == 1


def test_zero_budget_episode_reaches_terminal_status(tmp_path: Path) -> None:
    store = CheckpointStore(tmp_path / "episode.json")
    result = LongHorizonRunner(CorridorWorld(), HypothesisPolicy(), store).run(
        Episode("run-5", "demo", 0)
    )
    assert result.status == "budget_exhausted"
    assert result.actions == []
    assert result.observations == []
    assert store.load().status == "budget_exhausted"


def test_invalid_action_is_blocked(tmp_path: Path) -> None:
    class BadPolicy:
        def choose(self, observation, memory):
            return "DELETE_WORLD", memory

    store = CheckpointStore(tmp_path / "episode.json")
    result = LongHorizonRunner(CorridorWorld(), BadPolicy(), store).run(
        Episode("run-3", "demo", 10)
    )
    assert result.status == "blocked_invalid_action"
    assert result.actions == []
