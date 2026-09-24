"""
ml-training/scripts/generate_synthetic_cv_dataset.py — Synthetic CV Smoke-Test Dataset.

IMPORTANT: Generates trivial synthetic images (a colored rectangle "hazard
blob" on a plain background) in Ultralytics YOLO detection format. This
exists ONLY to prove that train_cv_hazard_model.py's YOLOv8 training
mechanics (data.yaml wiring, label format, train()/val() API calls) run
without error. A model trained on this data learns nothing about real
landslides/flooding/road damage and must NEVER be used for inference.

Real training requires real imagery (AIDER, CrisisMMD, Landslide4Sense, or
custom NH-6 field photos — see aiml developer.md §2 Module 1) and should run
on a Colab/Kaggle GPU per train_cv_hazard_model.py's docstring.
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
from PIL import Image

IMAGE_SIZE = 128
N_TRAIN = 40
N_VAL = 10
CLASS_NAMES = ["hazard_blob"]


def _make_image(rng: random.Random, has_hazard: bool) -> tuple[np.ndarray, list[tuple[int, float, float, float, float]]]:
    img = np.full((IMAGE_SIZE, IMAGE_SIZE, 3), fill_value=90, dtype=np.uint8)  # plain "road" gray
    labels: list[tuple[int, float, float, float, float]] = []

    if has_hazard:
        w = rng.randint(20, 50)
        h = rng.randint(20, 50)
        x0 = rng.randint(0, IMAGE_SIZE - w)
        y0 = rng.randint(0, IMAGE_SIZE - h)
        color = (rng.randint(100, 180), rng.randint(50, 100), rng.randint(20, 60))  # brown "landslide" blob
        img[y0 : y0 + h, x0 : x0 + w] = color

        x_center = (x0 + w / 2) / IMAGE_SIZE
        y_center = (y0 + h / 2) / IMAGE_SIZE
        labels.append((0, x_center, y_center, w / IMAGE_SIZE, h / IMAGE_SIZE))

    return img, labels


def _write_split(split: str, n: int, root: Path, seed: int) -> None:
    rng = random.Random(seed)
    images_dir = root / "images" / split
    labels_dir = root / "labels" / split
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    for i in range(n):
        has_hazard = i % 2 == 0
        img, labels = _make_image(rng, has_hazard)

        image_path = images_dir / f"{split}_{i:04d}.jpg"
        Image.fromarray(img).save(image_path)

        label_path = labels_dir / f"{split}_{i:04d}.txt"
        label_path.write_text(
            "\n".join(f"{c} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}" for c, xc, yc, w, h in labels),
            encoding="utf-8",
        )


def generate_synthetic_cv_dataset(root: Path) -> Path:
    _write_split("train", N_TRAIN, root, seed=1)
    _write_split("val", N_VAL, root, seed=2)

    data_yaml = root / "data.yaml"
    data_yaml.write_text(
        "\n".join(
            [
                f"path: {root.as_posix()}",
                "train: images/train",
                "val: images/val",
                f"nc: {len(CLASS_NAMES)}",
                f"names: {CLASS_NAMES}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return data_yaml


if __name__ == "__main__":
    out_root = Path(__file__).resolve().parent.parent / "data" / "synthetic_cv"
    yaml_path = generate_synthetic_cv_dataset(out_root)
    print(f"Wrote synthetic CV smoke-test dataset: {N_TRAIN} train + {N_VAL} val images")
    print(f"data.yaml at {yaml_path}")
