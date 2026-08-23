from __future__ import annotations

import argparse
import json
import subprocess
import uuid
from pathlib import Path

from .core import CheckpointStore, Episode, LongHorizonRunner
from .demo import CorridorWorld, HypothesisPolicy


def run_demo(checkpoint: Path, steps: int, resume: bool) -> int:
    store = CheckpointStore(checkpoint)
    episode = store.load() if resume and checkpoint.exists() else Episode(
        run_id=str(uuid.uuid4()), game_id="compat-corridor", action_budget=12
    )
    result = LongHorizonRunner(CorridorWorld(), HypothesisPolicy(), store).run(
        episode, max_steps=steps
    )
    print(json.dumps(result.to_dict(), indent=2))
    return 0


def ask_ox(task: str, repo: Path) -> int:
    command = [
        "opencode", "run", "--pure", "--model", "opencode-go/ox-alpha-free",
        "--dir", str(repo), task,
    ]
    return subprocess.run(command, check=False).returncode


def main() -> int:
    parser = argparse.ArgumentParser(prog="relay-arc")
    sub = parser.add_subparsers(dest="command", required=True)
    demo = sub.add_parser("demo", help="Run the local resumability proof")
    demo.add_argument("--checkpoint", type=Path, default=Path("artifacts/episode.json"))
    demo.add_argument("--steps", type=int, default=2)
    demo.add_argument("--resume", action="store_true")
    ox = sub.add_parser("ox", help="Give Ox Alpha a bounded repo task")
    ox.add_argument("task")
    ox.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args()
    if args.command == "demo":
        return run_demo(args.checkpoint, args.steps, args.resume)
    return ask_ox(args.task, args.repo)


if __name__ == "__main__":
    raise SystemExit(main())
