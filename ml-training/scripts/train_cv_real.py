"""
ml-training/scripts/train_cv_real.py — fine-tune YOLOv8n on the merged REAL landslide photo set
(build_real_cv_dataset.py). CPU-friendly. Reports val + held-out test metrics and exports ONNX next to
the run; does NOT overwrite the backend model — copy it manually after review.

    python scripts/train_cv_real.py [--data merged_v2] [--name cv_real_v2] [--epochs 35]
"""
import argparse
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--data", default="merged")
ap.add_argument("--name", default="cv_real_landslide")
ap.add_argument("--epochs", type=int, default=40)
ap.add_argument("--imgsz", type=int, default=416)
ap.add_argument("--patience", type=int, default=0, help="0 disables early stopping (val is too noisy on small data)")
a = ap.parse_args()
DATA = ROOT / "data" / "real_cv" / a.data / "data.yaml"

model = YOLO(str(ROOT / "yolov8n.pt"))
model.train(data=str(DATA), epochs=a.epochs, imgsz=a.imgsz, batch=8, device="cpu", patience=a.patience, workers=2, seed=42,
            project=str(ROOT / "models"), name=a.name, exist_ok=True, verbose=False, plots=False)
best = YOLO(str(ROOT / "models" / a.name / "weights" / "best.pt"))
for split in ("val", "test"):
    m = best.val(data=str(DATA), split=split, imgsz=a.imgsz, device="cpu", verbose=False, plots=False)
    print(f"[{split}] precision={m.box.mp:.3f} recall={m.box.mr:.3f} mAP50={m.box.map50:.3f} mAP50-95={m.box.map:.3f}")
print("onnx:", best.export(format="onnx", imgsz=a.imgsz))
