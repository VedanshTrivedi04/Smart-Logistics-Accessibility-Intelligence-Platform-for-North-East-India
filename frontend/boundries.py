#!/usr/bin/env python3
"""Conservative frontend import checks using the Python standard library.

This is not a TypeScript parser. It checks common static imports/exports,
requires and literal dynamic imports; unusual syntax needs ESLint/TS review.
Comments containing import examples may be flagged; do not use this as the
sole CI or security control. Python is development tooling, not browser code.
"""
from __future__ import annotations

import argparse
from pathlib import Path, PurePosixPath
import posixpath
import re
import sys

IMPORTS = re.compile(
    r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)[\"']([^\"']+)[\"']"
)
NONLITERAL = re.compile(r"\b(?:import|require)\s*\(\s*(?![\s\"'])[^\s]")
DB_PACKAGES = {"pg", "postgres", "postgresql", "prisma", "@prisma/client", "drizzle-orm", "mysql2"}


def target_path(source: str, target: str) -> str | None:
    """Resolve @/ and relative imports to src-relative POSIX paths."""
    if target.startswith("@/"):
        value = target[2:]
    elif target.startswith("."):
        value = posixpath.join(posixpath.dirname(source), target)
    else:
        return None
    normalized = posixpath.normpath(value)
    for suffix in (".tsx", ".ts", ".jsx", ".js"):
        if normalized.endswith(suffix):
            normalized = normalized[:-len(suffix)]
            break
    return normalized


def violation(source: str, target: str) -> str | None:
    if "backend" in PurePosixPath(target).parts:
        return "frontend cannot import backend source"
    if any(target == package or target.startswith(package + "/") for package in DB_PACKAGES):
        return "frontend must use FastAPI, not a database client"
    resolved = target_path(source, target)
    if resolved is None:
        if target.startswith(("~/", "#")):
            return "unreviewed local alias; use the configured @/ alias"
        return None
    if resolved == ".." or resolved.startswith("../") or resolved.startswith("/"):
        return "source import escapes frontend/src"
    src, dst = PurePosixPath(source).parts, PurePosixPath(resolved).parts
    if not src or not dst:
        return None
    if src[0] == "shared" and dst[0] in {"features", "app"}:
        return "shared code cannot depend on features or app"
    if src[0] == "features" and dst[0] == "app":
        return "features cannot import route composition"
    if dst[0] == "features" and len(dst) >= 2:
        same_feature = src[0] == "features" and len(src) >= 2 and src[1] == dst[1]
        public_entry = len(dst) == 2 or (len(dst) == 3 and dst[2] == "index")
        if not same_feature and not public_entry:
            return "cross-feature and app imports must use the feature index.ts entrypoint"
    return None


def check(root: Path) -> list[str]:
    src_root = root / "frontend" / "src"
    if not src_root.is_dir():
        return ["missing frontend/src; initialize the Next.js application before checking"]
    paths = sorted(path for path in src_root.rglob("*") if path.suffix in {".ts", ".tsx", ".js", ".jsx"})
    if not paths:
        return ["no frontend source files found; empty projects cannot pass"]
    errors: list[str] = []
    for path in paths:
        source = path.relative_to(src_root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            errors.append(f"{source}: unable to read: {exc}")
            continue
        for match in IMPORTS.finditer(text):
            target = match.group(1)
            reason = violation(source, target)
            if reason:
                line = text.count("\n", 0, match.start()) + 1
                errors.append(f"{source}:{line}: {target}: {reason}")
        for match in NONLITERAL.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            errors.append(f"{source}:{line}: nonliteral dynamic import requires architecture review")
    return sorted(set(errors))


def self_test() -> None:
    import tempfile
    assert violation("shared/ui/Badge.tsx", "@/features/incidents")
    assert violation("features/fleet/Map.tsx", "@/features/incidents/private/api")
    assert violation("features/fleet/Map.tsx", "@/features/incidents") is None
    assert violation("features/fleet/Map.tsx", "./internal") is None
    assert violation("app/government/page.tsx", "@/features/incidents/index") is None
    assert violation("app/government/page.tsx", "@/features/incidents/private")
    assert violation("shared/api/client.ts", "pg")
    assert violation("shared/api/client.ts", "../../../backend/app")
    assert target_path("features/fleet/view.tsx", "../../shared/ui") == "shared/ui"
    text = 'import x from "@/features/fleet"; export { x } from "./x"; import("./lazy"); require("pg");'
    assert IMPORTS.findall(text) == ["@/features/fleet", "./x", "./lazy", "pg"]
    assert NONLITERAL.search("import(variable)")
    assert not NONLITERAL.search('import("./literal")')
    with tempfile.TemporaryDirectory() as tmp:
        assert check(Path(tmp)), "an empty tree must fail"
    print("Frontend boundary self-tests passed.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    errors = check(args.root.resolve())
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Frontend import checks passed (limited syntax check, not a security audit).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
