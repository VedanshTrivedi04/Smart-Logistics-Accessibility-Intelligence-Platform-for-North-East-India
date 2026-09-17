#!/usr/bin/env python3
"""Narrow, fail-closed Python import-layer checker; not runtime authorization.

Usage: python backend/boundries.py --root .
       python backend/boundries.py --self-test
Root is the monorepo root. Standard library only; Python 3.11+.
"""
from __future__ import annotations

import argparse
import ast
from pathlib import Path
import sys

LAYERS = {"api", "domain", "application", "infrastructure", "public"}
DOMAIN_EXTERNAL = set(sys.stdlib_module_names)
FORBIDDEN_EXTERNAL = {"fastapi", "sqlalchemy", "httpx", "requests", "celery", "redis", "boto3", "psycopg", "asyncpg"}


def module_name(path: Path, app_root: Path) -> str:
    parts = ["app", *path.relative_to(app_root).with_suffix("").parts]
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def import_targets(tree: ast.AST, source: str, is_package: bool) -> list[tuple[int, str]]:
    targets: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            targets.extend((node.lineno, alias.name) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                package = source.split(".") if is_package else source.split(".")[:-1]
                trim = node.level - 1
                if trim >= len(package):
                    targets.append((node.lineno, "!invalid_relative_import"))
                    continue
                prefix = package[:len(package) - trim] if trim else package
                base = ".".join(prefix + (node.module.split(".") if node.module else []))
            else:
                base = node.module or ""
            # Expand aliases as well to catch imports through a parent package.
            targets.append((node.lineno, base))
            targets.extend((node.lineno, f"{base}.{alias.name}") for alias in node.names)
        elif isinstance(node, ast.Call):
            name = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", "")
            if name in {"__import__", "import_module"}:
                targets.append((node.lineno, "!dynamic_import"))
    return targets


def violation(source: str, target: str) -> str | None:
    if target.startswith("!"):
        return "dynamic or invalid relative import requires explicit architecture review"
    src, dst = source.split("."), target.split(".")
    if source.startswith("app.core") and target.startswith("app.modules"):
        return "core cannot import business modules"
    if len(src) < 4 or src[:2] != ["app", "modules"]:
        return None
    module, layer = src[2], src[3]
    # A module file such as domain.py also has only four parts.
    if layer not in LAYERS:
        return None
    if layer == "domain" and dst[0] != "app" and dst[0] not in DOMAIN_EXTERNAL:
        return "domain permits standard-library and own-domain imports only"
    if layer in {"domain", "application", "api"} and dst[0] in FORBIDDEN_EXTERNAL:
        if not (layer == "api" and dst[0] == "fastapi"):
            return f"{layer} cannot depend directly on infrastructure package {dst[0]}"
    if dst[0] != "app":
        return None
    if len(dst) >= 2 and dst[1] == "core":
        return None
    if len(dst) < 4 or dst[:2] != ["app", "modules"]:
        return "module layers must import named module contracts, not app composition or parent packages"
    dest_module, dest_layer = dst[2], dst[3]
    if dest_module != module:
        if layer == "domain" or dest_layer != "public":
            return "cross-module access must use public.py; domain cannot cross modules"
        return None
    blocked = {
        "domain": {"api", "application", "infrastructure", "public"},
        "application": {"api", "infrastructure"},
        "api": {"infrastructure"},
        "infrastructure": {"api"},
        "public": {"api", "infrastructure"},
    }
    if dest_layer not in LAYERS or dest_layer in blocked[layer]:
        return f"invalid dependency from {layer} to {dest_layer}"
    return None


def check(root: Path) -> list[str]:
    app_root = root / "backend" / "app"
    if not app_root.is_dir() or not (app_root / "main.py").is_file():
        return ["missing backend/app/main.py; initialize the application before checking"]
    paths = sorted(app_root.rglob("*.py"))
    errors: list[str] = []
    for path in paths:
        source = module_name(path, app_root)
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (SyntaxError, UnicodeError, OSError) as exc:
            errors.append(f"{path.relative_to(root)}: parse failed: {exc}")
            continue
        for line, target in import_targets(tree, source, path.name == "__init__.py"):
            reason = violation(source, target)
            if reason:
                errors.append(f"{path.relative_to(root)}:{line}: {target}: {reason}")
    return sorted(set(errors))


def self_test() -> None:
    import tempfile
    assert violation("app.modules.routing.domain.rules", "sqlalchemy")
    assert violation("app.modules.routing.application.service", "app.modules.routing.infrastructure.repo")
    assert violation("app.modules.routing.api.routes", "app.modules.logistics.infrastructure.repo")
    assert violation("app.core.config", "app.modules.identity.public")
    assert violation("app.modules.routing.domain.rules", "app.modules.logistics.public")
    assert violation("app.modules.routing.application.service", "app.modules.logistics.public") is None
    assert violation("app.modules.routing.domain.rules", "dataclasses") is None
    assert violation("app.modules.routing.api.routes", "fastapi") is None
    tree = ast.parse("from ..domain import rules\n")
    targets = import_targets(tree, "app.modules.routing.application.service", False)
    assert (1, "app.modules.routing.domain.rules") in targets
    tree = ast.parse("importlib.import_module(name)")
    assert (1, "!dynamic_import") in import_targets(tree, "app.main", False)
    with tempfile.TemporaryDirectory() as tmp:
        assert check(Path(tmp)), "an empty tree must fail"
    print("Backend boundary self-tests passed.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    root = args.root.resolve()
    errors = check(root)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Backend import-layer checks passed (not a security audit).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
