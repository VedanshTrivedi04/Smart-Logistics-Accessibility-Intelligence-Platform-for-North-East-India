"""
ml-training/scripts/build_real_cv_dataset_v3.py — pooled, de-duplicated, leak-free landslide detection set.

Why: the Roboflow datasets overlap heavily (drone_roads_landslide contains all 98 images of
raghava_priya_landslide) and each contains augmented near-duplicate copies. Splitting per source lets a
copy land in train and another in test -> inflated metrics. Here every positive image is pooled, near-
duplicates (64-bit dHash, Hamming <= 6) are clustered, ONE image per cluster is kept, and the clusters are
split 70/15/15 with a fixed seed. Wikimedia negatives (background, empty labels) are split 70/15/15 too.

Sources (Roboflow Universe, CC BY 4.0 — attribution required):
  raghava_priya_landslide  raghava-priya/landslide-htrll
  ambit_landslide          Ambit "landslide Computer Vision Dataset"
  drone_roads_landslide    roads-detection-with-drones/landslide-detection-2dme2
  littlepaddys_landslide   littlepaddys Workspace "landslide"
Polygons are converted to enclosing boxes; single class `landslide` (== HazardClass.LANDSLIDE).
NOT used: roads_landslide_sat (satellite). Output: data/real_cv/merged_v3.
"""

from __future__ import annotations

import random
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "data" / "real_cv"
OUT = ROOT / "merged_v3"
NEG_DIR = ROOT / "negatives_wikimedia"
# (source dir, class index that means "landslide") — earlier sources listed first win ties in a cluster.
SOURCES = [("littlepaddys_landslide", 0), ("ambit_landslide", 0), ("drone_roads_landslide", 0), ("raghava_priya_landslide", 0)]
SPLITS = ("train", "valid", "test")
HAMMING = 6
SEED = 42


def dhash(path: Path, n: int = 8) -> int:
    px = list(Image.open(path).convert("L").resize((n + 1, n)).tobytes())
    return sum(1 << (i * n + j) for i in range(n) for j in range(n) if px[i * (n + 1) + j] > px[i * (n + 1) + j + 1])


def to_box(line: str, keep_class: int) -> str | None:
    p = line.split()
    if not p or int(p[0]) != keep_class:
        return None
    v = [float(x) for x in p[1:]]
    if len(v) == 4:
        return f"0 {v[0]:.6f} {v[1]:.6f} {v[2]:.6f} {v[3]:.6f}"
    xs, ys = v[0::2], v[1::2]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    return f"0 {(x0 + x1) / 2:.6f} {(y0 + y1) / 2:.6f} {x1 - x0:.6f} {y1 - y0:.6f}"


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    items = []  # (source, image path, boxes, hash)
    for src, keep in SOURCES:
        for split in SPLITS:
            d = ROOT / src / split / "images"
            if not d.exists():
                continue
            for img in sorted(d.iterdir()):
                lbl = ROOT / src / split / "labels" / f"{img.stem}.txt"
                boxes = [b for b in (to_box(l, keep) for l in (lbl.read_text().splitlines() if lbl.exists() else [])) if b]
                if boxes:  # positives only; source "background" images are not trusted
                    items.append((src, img, boxes, dhash(img)))
    kept, dropped = [], 0
    for it in items:
        if any(bin(it[3] ^ k[3]).count("1") <= HAMMING for k in kept):
            dropped += 1
        else:
            kept.append(it)
    print(f"positives: {len(items)} pooled -> {len(kept)} unique ({dropped} near-duplicates dropped)")
    rng = random.Random(SEED)
    rng.shuffle(kept)
    negs = sorted((NEG_DIR / "images").glob("*.jpg"))
    rng.shuffle(negs)

    def split_of(i: int, n: int) -> str:
        return "train" if i < int(n * 0.70) else "valid" if i < int(n * 0.85) else "test"

    stats: dict[str, dict[str, int]] = {}
    for kind in ("images", "labels"):
        for s in SPLITS:
            (OUT / s / kind).mkdir(parents=True, exist_ok=True)
    for i, (src, img, boxes, _) in enumerate(kept):
        s, name = split_of(i, len(kept)), f"pos_{i:04d}"
        shutil.copy(img, OUT / s / "images" / f"{name}{img.suffix}")
        (OUT / s / "labels" / f"{name}.txt").write_text("\n".join(boxes))
        st = stats.setdefault(s, {"positives": 0, "boxes": 0, "negatives": 0})
        st["positives"] += 1
        st["boxes"] += len(boxes)
    for i, img in enumerate(negs):
        s = split_of(i, len(negs))
        shutil.copy(img, OUT / s / "images" / img.name)
        (OUT / s / "labels" / f"{img.stem}.txt").write_text("")
        stats.setdefault(s, {"positives": 0, "boxes": 0, "negatives": 0})["negatives"] += 1
    (OUT / "data.yaml").write_text(
        f"path: {OUT.as_posix()}\ntrain: train/images\nval: valid/images\ntest: test/images\nnc: 1\nnames: ['landslide']\n")
    print(stats)


if __name__ == "__main__":
    main()
