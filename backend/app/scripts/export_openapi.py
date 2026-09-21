"""
app/scripts/export_openapi.py — Export OpenAPI schema JSON.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.main import app


def export_openapi() -> None:
    schema = app.openapi()
    output_path = Path(__file__).resolve().parent.parent.parent / "openapi.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2)
    print(f"OpenAPI schema successfully written to {output_path}")


if __name__ == "__main__":
    export_openapi()
