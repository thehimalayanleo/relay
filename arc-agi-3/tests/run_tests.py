"""Standard-library test runner fallback for when pytest is unavailable.

Usage: python3 tests/run_tests.py
"""

from __future__ import annotations

import importlib
import inspect
import sys
import tempfile
import traceback
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "src"))
sys.path.insert(0, str(REPO_ROOT / "tests"))


def main() -> int:
    failures = 0
    passed = 0
    module = importlib.import_module("test_core")
    tests = [
        (name, obj)
        for name, obj in vars(module).items()
        if name.startswith("test_") and inspect.isfunction(obj)
    ]
    with tempfile.TemporaryDirectory() as base:
        for name, func in tests:
            try:
                if "tmp_path" in inspect.signature(func).parameters:
                    tmp_path = Path(base) / name
                    tmp_path.mkdir()
                    func(tmp_path)
                else:
                    func()
            except Exception:
                failures += 1
                print(f"FAIL {name}")
                traceback.print_exc()
            else:
                passed += 1
                print(f"PASS {name}")
    print(f"\n{passed} passed, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
