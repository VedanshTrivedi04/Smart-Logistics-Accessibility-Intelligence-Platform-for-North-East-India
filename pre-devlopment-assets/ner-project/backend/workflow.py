#!/usr/bin/env python3
"""Run backend development gates without deploying or changing databases.

Usage: python backend/workflow.py --root . [--dry-run] [--timeout 1200]
Use an activated Python 3.11+ environment with project dependencies installed.
Tests must provision disposable databases; this runner does not run migrations.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import shlex
import subprocess
import sys


def commands(root: Path) -> list[list[str]]:
    boundary = str(root / "backend" / "boundries.py")
    return [
        [sys.executable, boundary, "--self-test"],
        [sys.executable, boundary, "--root", str(root)],
        [sys.executable, "-m", "ruff", "check", "app", "tests"],
        [sys.executable, "-m", "mypy", "app"],
        [sys.executable, "-m", "pytest", "tests", "-q"],
    ]


def validate(root: Path) -> list[str]:
    backend = root / "backend"
    required = ["boundries.py", "pyproject.toml", "alembic.ini", "app/main.py"]
    errors = [f"Missing backend/{path}" for path in required if not (backend / path).is_file()]
    tests = backend / "tests"
    if not tests.is_dir() or not any(tests.rglob("test_*.py")):
        errors.append("Missing backend/tests/test_*.py; an empty test suite cannot pass")
    return errors


def run(root: Path, timeout: int, dry_run: bool) -> int:
    plan = commands(root)
    if dry_run:
        print("DRY RUN: command plan only; prerequisites and tests are NOT checked.")
        print(f"Working directory: {root / 'backend'}")
        for command in plan:
            print(shlex.join(command))
        return 0
    errors = validate(root)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 2
    for command in plan:
        print(f"Running: {shlex.join(command)}", flush=True)
        try:
            result = subprocess.run(command, cwd=root / "backend", check=False, timeout=timeout, shell=False)
        except subprocess.TimeoutExpired:
            print(f"Gate timed out after {timeout} seconds; workflow stopped.", file=sys.stderr)
            return 124
        except OSError as exc:
            print(f"Could not start gate: {exc}", file=sys.stderr)
            return 2
        if result.returncode:
            print("Gate failed; subsequent gates were not run.", file=sys.stderr)
            return result.returncode if result.returncode > 0 else 1
    print("Configured backend gates passed; this does not establish pilot or production readiness.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--timeout", type=int, default=1200, help="Maximum seconds per gate")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        return run(args.root.resolve(), args.timeout, args.dry_run)
    except KeyboardInterrupt:
        print("Workflow interrupted; completion was not established.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
