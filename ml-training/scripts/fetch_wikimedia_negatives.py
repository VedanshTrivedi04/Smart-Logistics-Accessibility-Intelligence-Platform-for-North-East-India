"""
ml-training/scripts/fetch_wikimedia_negatives.py — "no landslide" (negative / hard-negative) road & hillside
photos from Wikimedia Commons, with licence + attribution kept.

Only CC0 / Public Domain / CC BY / CC BY-SA files are kept (CC BY* require attribution — see
attribution.csv, which must ship with any redistributed data). Files whose title/description mention
landslide-like words are dropped so we don't create false negatives. Images are stored as 640px-wide
thumbnails with an EMPTY YOLO label file (background image).

    python scripts/fetch_wikimedia_negatives.py [--target 300]
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "real_cv" / "negatives_wikimedia"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "NER-Logistics-SIH2026-research/0.1 (student project; contact via repo owner)"}

CATEGORIES = [
    "Roads in Meghalaya", "Roads in Sikkim", "Roads in Assam", "Roads in Nagaland", "Roads in Arunachal Pradesh",
    "Roads in Mizoram", "Roads in Manipur", "Roads in Tripura", "Roads in Darjeeling district", "Roads in Uttarakhand",
    "Roads in Himachal Pradesh", "Roads in Bhutan", "National Highway 10 (India)", "National Highway 6 (India)",
    "National Highway 37 (India)", "National Highway 27 (India)",
]
SKIP_SUBCAT = re.compile(r"landslide|damage|accident|flood|disaster|protest|bandh|blockade|market|festival|temple|monaster", re.I)
BAD_WORDS = re.compile(r"temple|monaster|mosque|church|festival|portrait|people|crowd|market|shop|interior|statue|landslide|landslip|rockfall|rock fall|mudslide|debris|collapse|damage|flood|erosion|"
                       r"earthquake|disaster|accident|blocked|slip|avalanche|cyclone|storm", re.I)


def call(params: dict) -> dict:
    url = f"{API}?{urllib.parse.urlencode({**params, 'format': 'json'})}"
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            time.sleep(10 * (i + 1))  # generous backoff (Wikimedia returns 429 when hammered)
    return {}


def strip(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=300)
    args = ap.parse_args()
    (OUT / "images").mkdir(parents=True, exist_ok=True)
    (OUT / "labels").mkdir(parents=True, exist_ok=True)

    seen: set[str] = set()
    rows: list[dict] = []

    def harvest(cat: str, depth: int) -> None:
        if len(rows) >= args.target:
            return
        cont: dict = {}
        while len(rows) < args.target:
            d = call({"action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{cat}", "gcmtype": "file",
                      "gcmlimit": 50, "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 640, **cont})
            for p in ((d.get("query") or {}).get("pages", {})).values():
                title = p["title"]
                info = (p.get("imageinfo") or [{}])[0]
                meta = info.get("extmetadata", {})
                lic = strip(meta.get("LicenseShortName", {}).get("value", ""))
                desc = strip(meta.get("ImageDescription", {}).get("value", ""))
                cats = strip(meta.get("Categories", {}).get("value", ""))
                up = lic.upper()
                if title in seen or not up.startswith(("CC0", "PUBLIC DOMAIN", "PD", "CC BY")):
                    continue
                if "NC" in up or "ND" in up or BAD_WORDS.search(f"{title} {desc} {cats}"):
                    continue
                if info.get("mime") not in ("image/jpeg", "image/png") or info.get("width", 0) < 640:
                    continue
                seen.add(title)
                rows.append({"title": title, "thumb": info.get("thumburl"), "page": info.get("descriptionshorturl"),
                             "author": strip(meta.get("Artist", {}).get("value", ""))[:120], "licence": lic, "query": cat})
            time.sleep(1.5)
            cont = (d.get("continue") or {})
            if not cont:
                break
        if depth < 1:
            sub = call({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{cat}", "cmtype": "subcat", "cmlimit": 50})
            for m in (sub.get("query") or {}).get("categorymembers", []):
                name = m["title"].removeprefix("Category:")
                if not SKIP_SUBCAT.search(name):
                    harvest(name, depth + 1)
            time.sleep(1.5)

    for cat in CATEGORIES:
        harvest(cat, 0)
        print(f"{cat!r}: total candidates {len(rows)}", flush=True)
        if len(rows) >= args.target:
            break

    kept = []
    for i, r in enumerate(rows[: args.target]):
        name = f"wm_{i:04d}"
        try:
            req = urllib.request.Request(r["thumb"], headers=UA)
            (OUT / "images" / f"{name}.jpg").write_bytes(urllib.request.urlopen(req, timeout=60).read())
            (OUT / "labels" / f"{name}.txt").write_text("")
            kept.append({"file": f"{name}.jpg", **{k: r[k] for k in ("title", "author", "licence", "page", "query")}})
        except Exception as exc:  # noqa: BLE001
            print("skip", r["title"], type(exc).__name__)
        time.sleep(1.0)
    with open(OUT / "attribution.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["file", "title", "author", "licence", "page", "query"])
        w.writeheader()
        w.writerows(kept)
    print(f"saved {len(kept)} negative images + attribution.csv in {OUT}")


if __name__ == "__main__":
    main()
