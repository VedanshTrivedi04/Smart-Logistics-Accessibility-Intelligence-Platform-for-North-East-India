#!/usr/bin/env python3
"""Run Next.js project gates using Python as local development tooling only.

Usage: python frontend/workflow.py --root . [--dry-run] [--timeout 1200]
Install the locked frontend dependencies first. No install or deployment runs
here. End-to-end tests must be configured for non-production test services.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

SCRIPTS = ("lint", "typecheck", "test", "test:e2e", "build")


def commands(root: Path, package_manager: str) -> list[list[str]]:
    boundary = str(root / "frontend" / "boundries.py")
    return [
        [sys.executable, boundary, "--self-test"],
        [sys.executable, boundary, "--root", str(root)],
        *[[package_manager, "run", name] for name in SCRIPTS],
    ]


def validate(root: Path) -> list[str]:
    frontend = root / "frontend"
    errors: list[str] = []
    for name in ("boundries.py", "package.json", "pnpm-lock.yaml"):
        if not (frontend / name).is_file():
            errors.append(f"Missing frontend/{name}")
    if not (frontend / "src" / "app").is_dir():
        errors.append("Missing frontend/src/app")
    manifest = frontend / "package.json"
    if manifest.is_file():
        try:
            value = json.loads(manifest.read_text(encoding="utf-8"))
            if not isinstance(value, dict) or not isinstance(value.get("scripts"), dict):
                errors.append("package.json must contain a scripts object")
            else:
                for name in SCRIPTS:
                    script = value["scripts"].get(name)
                    if not isinstance(script, str) or not script.strip():
                        errors.append(f"Missing nonempty package.json script: {name}")
                if not str(value.get("packageManager", "")).startswith("pnpm@"):
                    errors.append("Pin pnpm with the packageManager field")
        except (ValueError, OSError, UnicodeError) as exc:
            errors.append(f"Invalid package.json: {exc}")
    test_files = []
    for directory in (frontend / "tests", frontend / "src"):
        if directory.is_dir():
            test_files.extend(path for path in directory.rglob("*") if path.is_file() and any(
                marker in path.name for marker in (".test.", ".spec.")
            ))
    if not test_files:
        errors.append("Missing .test. or .spec. files under frontend/tests or frontend/src")
    return errors


def run(root: Path, timeout: int, dry_run: bool) -> int:
    executable = shutil.which("pnpm")
    plan = commands(root, executable or "pnpm")
    if dry_run:
        print("DRY RUN: command plan only; prerequisites and tests are NOT checked.")
        print(f"Working directory: {root / 'frontend'}")
        for command in plan:
            print(shlex.join(command))
        return 0
    errors = validate(root)
    if executable is None:
        errors.append("pnpm is not on PATH; install the project's pinned package manager first")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 2
    for command in plan:
        print(f"Running: {shlex.join(command)}", flush=True)
        try:
            result = subprocess.run(command, cwd=root / "frontend", check=False, timeout=timeout, shell=False)
        except subprocess.TimeoutExpired:
            print(f"Gate timed out after {timeout} seconds; workflow stopped.", file=sys.stderr)
            return 124
        except OSError as exc:
            print(f"Could not start gate: {exc}", file=sys.stderr)
            return 2
        if result.returncode:
            print("Gate failed; subsequent gates were not run.", file=sys.stderr)
            return result.returncode if result.returncode > 0 else 1
    print("Configured frontend gates passed; this is not an accessibility or security certification.")
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
