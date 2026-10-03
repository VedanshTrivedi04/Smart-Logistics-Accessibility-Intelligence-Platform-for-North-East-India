"""
ml-training/scripts/build_real_cv_dataset.py — merge real ground-level landslide photo datasets.

Sources (Roboflow Universe, all CC BY 4.0 — attribution required, see README below):
  raghava_priya_landslide : https://universe.roboflow.com/raghava-priya/landslide-htrll (boxes; classes landslide/normal)
  ambit_landslide         : Ambit "landslide Computer Vision Dataset" (polygons -> converted to boxes)
NOT used: roads_landslide_sat (satellite imagery — wrong domain for field photos).

Output: data/real_cv/merged/{train,valid,test}/{images,labels} + data.yaml with a single class
`landslide` (== HazardClass.LANDSLIDE). Raghava's `normal` boxes are dropped and those images kept
as background (negative) examples. Original train/valid/test splits are preserved.

CAVEAT: several source images are stock photos (visible watermarks); Roboflow's CC BY licence does
not necessarily cover the underlying photos — fine for research, re-check before redistribution.
"""

from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "real_cv"
OUT = ROOT / "merged"
NEG_DIR = ROOT / "negatives_wikimedia"  # background images + empty labels (CC BY / CC BY-SA, see attribution.csv)
SOURCES = {"raghava_priya_landslide": {"landslide": 0, "normal": 1}, "ambit_landslide": {"land-slide5": 0}}
SPLITS = ("train", "valid", "test")


def convert_line(line: str, keep_class: int) -> str | None:
    p = line.split()
    if not p:
        return None
    cls, vals = int(p[0]), [float(v) for v in p[1:]]
    if cls != keep_class:
        return None
    if len(vals) == 4:  # already a box
        return f"0 {vals[0]:.6f} {vals[1]:.6f} {vals[2]:.6f} {vals[3]:.6f}"
    xs, ys = vals[0::2], vals[1::2]  # polygon -> enclosing box
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    return f"0 {(x0 + x1) / 2:.6f} {(y0 + y1) / 2:.6f} {x1 - x0:.6f} {y1 - y0:.6f}"


def main() -> None:
    global OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-negatives", action="store_true", help="add Wikimedia negatives, written to merged_v2")
    args = ap.parse_args()
    if args.with_negatives:
        OUT = ROOT / "merged_v2"
    if OUT.exists():
        shutil.rmtree(OUT)
    stats: dict[str, dict[str, int]] = {}
    for src in SOURCES:
        for split in SPLITS:
            img_dir, lbl_dir = ROOT / src / split / "images", ROOT / src / split / "labels"
            if not img_dir.exists():
                continue
            (OUT / split / "images").mkdir(parents=True, exist_ok=True)
            (OUT / split / "labels").mkdir(parents=True, exist_ok=True)
            for img in sorted(img_dir.iterdir()):
                new = f"{src[:3]}_{img.stem}"
                shutil.copy(img, OUT / split / "images" / f"{new}{img.suffix}")
                lbl = lbl_dir / f"{img.stem}.txt"
                lines = lbl.read_text().splitlines() if lbl.exists() else []
                boxes = [b for b in (convert_line(l, 0) for l in lines) if b]
                (OUT / split / "labels" / f"{new}.txt").write_text("\n".join(boxes))
                s = stats.setdefault(split, {"images": 0, "boxes": 0, "background": 0})
                s["images"] += 1
                s["boxes"] += len(boxes)
                s["background"] += int(not boxes)
    if args.with_negatives:
        negs = sorted((NEG_DIR / "images").glob("*.jpg"))
        random.Random(42).shuffle(negs)
        cut = (int(len(negs) * 0.70), int(len(negs) * 0.85))
        for i, img in enumerate(negs):
            split = "train" if i < cut[0] else "valid" if i < cut[1] else "test"
            for kind in ("images", "labels"):
                (OUT / split / kind).mkdir(parents=True, exist_ok=True)
            shutil.copy(img, OUT / split / "images" / img.name)
            (OUT / split / "labels" / f"{img.stem}.txt").write_text("")
            s = stats.setdefault(split, {"images": 0, "boxes": 0, "background": 0})
            s["images"] += 1
            s["background"] += 1
    (OUT / "data.yaml").write_text(
        f"path: {OUT.as_posix()}\ntrain: train/images\nval: valid/images\ntest: test/images\nnc: 1\nnames: ['landslide']\n")
    print(stats)


if __name__ == "__main__":
    main()
