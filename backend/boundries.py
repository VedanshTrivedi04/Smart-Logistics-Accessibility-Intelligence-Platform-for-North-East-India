"""
boundries.py — Architecture boundary checker.

Enforces the dependency rule across all modules:
  domain/ → no FastAPI, SQLAlchemy, httpx, celery, boto3 imports
  application/ → no SQLAlchemy, httpx, celery, boto3 imports (only port interfaces)
  api/ → no direct infrastructure/ imports

Run: uv run python boundries.py
Or:  make check-boundaries

Exits with code 1 if any violation is found.
"""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass, field
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ──────────────────────────────────────────────────────────────
# Rules configuration
# ──────────────────────────────────────────────────────────────

@dataclass
class BoundaryRule:
    """A boundary rule: files in `layer_path` must not import from `forbidden`."""
    name: str
    layer_glob: str      # glob relative to backend/app/
    forbidden: list[str] # forbidden top-level import names
    description: str


RULES: list[BoundaryRule] = [
    BoundaryRule(
        name="domain-no-io",
        layer_glob="**/domain/**/*.py",
        forbidden=[
            "fastapi", "sqlalchemy", "alembic", "asyncpg",
            "celery", "redis", "boto3", "botocore", "httpx",
            "pydantic_settings",
        ],
        description="domain/ must contain only pure Python business logic. "
                    "No IO, no HTTP, no ORM, no queue, no storage.",
    ),
    BoundaryRule(
        name="application-no-infrastructure",
        layer_glob="**/application/**/*.py",
        forbidden=[
            "sqlalchemy", "asyncpg", "boto3", "botocore",
            "celery", "redis", "httpx",
        ],
        description="application/ must depend on port interfaces only. "
                    "No direct DB, storage, or queue imports. "
                    "Use dependency injection via constructor/protocol.",
    ),
    BoundaryRule(
        name="api-no-direct-infra",
        layer_glob="**/api/**/*.py",
        forbidden=["sqlalchemy", "asyncpg", "boto3", "botocore", "celery"],
        description="api/ (routers) must not import infrastructure directly. "
                    "Access DB via use cases + repository interfaces only.",
    ),
]


# ──────────────────────────────────────────────────────────────
# Violation detection
# ──────────────────────────────────────────────────────────────

@dataclass
class Violation:
    rule: str
    file: Path
    line: int
    forbidden_import: str
    description: str


def _get_imports(source: str) -> list[tuple[int, str]]:
    """
    Parse Python source and return (lineno, top_level_module) for all imports.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    imports: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                imports.append((node.lineno, top))
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                imports.append((node.lineno, top))
    return imports


def check_boundaries(app_root: Path) -> list[Violation]:
    """Check all boundary rules and return list of violations."""
    violations: list[Violation] = []

    for rule in RULES:
        for py_file in app_root.glob(rule.layer_glob):
            if py_file.name.startswith("_"):
                continue  # Skip __init__.py etc.
            try:
                source = py_file.read_text(encoding="utf-8")
            except OSError:
                continue

            for lineno, top_module in _get_imports(source):
                if top_module in rule.forbidden:
                    violations.append(
                        Violation(
                            rule=rule.name,
                            file=py_file,
                            line=lineno,
                            forbidden_import=top_module,
                            description=rule.description,
                        )
                    )

    return violations


# ──────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────

def main() -> int:
    backend_dir = Path(__file__).parent
    app_dir = backend_dir / "app"

    if not app_dir.exists():
        print("No app/ directory found — nothing to check.")
        return 0

    print(f"Checking architecture boundaries in: {app_dir}")
    violations = check_boundaries(app_dir)

    if not violations:
        print("✅ No boundary violations found.")
        return 0

    print(f"\n❌ Found {len(violations)} boundary violation(s):\n")
    for v in violations:
        rel_path = v.file.relative_to(backend_dir)
        print(f"  Rule [{v.rule}]")
        print(f"  File: {rel_path}:{v.line}")
        print(f"  Forbidden import: '{v.forbidden_import}'")
        print(f"  Reason: {v.description}")
        print()

    return 1


if __name__ == "__main__":
    sys.exit(main())
