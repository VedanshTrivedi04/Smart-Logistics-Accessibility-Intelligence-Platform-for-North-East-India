# %% [markdown]
# # Landslide hazard detector - GPU training (Colab / Kaggle)
# 1. Runtime > Change runtime type > **T4 GPU**.
# 2. Upload `landslide_cv_colab_package.zip` (left sidebar > Files) - or mount Drive and set ZIP_PATH.
# 3. Run all cells. Results are zipped to `cv_results.zip` (download it and send it back).
# Trains YOLOv8s and YOLOv8m at 640px, picks the better on VAL, reports held-out TEST metrics,
# a confidence-threshold sweep, and exports ONNX. Test data is never used for any choice.

# %%
!pip -q install ultralytics==8.4.104 onnx onnxslim

# %%
import json, shutil, zipfile
from pathlib import Path

ZIP_PATH = Path("/content/landslide_cv_colab_package.zip")
ROOT = Path("/content/cvdata")
if ROOT.exists():
    shutil.rmtree(ROOT)
zipfile.ZipFile(ZIP_PATH).extractall(ROOT)
DATA = ROOT / "merged_v3"
(DATA / "data.yaml").write_text(
    f"path: {DATA}\ntrain: train/images\nval: valid/images\ntest: test/images\nnc: 1\nnames: ['landslide']\n")
for s in ("train", "valid", "test"):
    print(s, len(list((DATA / s / "images").iterdir())), "images")

# %%
import torch
from ultralytics import YOLO

assert torch.cuda.is_available(), "Enable a GPU runtime first (T4)"
EPOCHS, IMGSZ, SEED = 100, 640, 42
results = {}
for variant in ("yolov8s.pt", "yolov8m.pt"):
    name = variant.replace(".pt", "")
    m = YOLO(variant)
    m.train(data=str(DATA / "data.yaml"), epochs=EPOCHS, imgsz=IMGSZ, batch=16, device=0, seed=SEED, patience=0,
            cos_lr=True, close_mosaic=15, mosaic=1.0, mixup=0.1, fliplr=0.5, degrees=8, translate=0.1, scale=0.5,
            hsv_h=0.02, hsv_s=0.6, hsv_v=0.4, project="/content/runs", name=name, exist_ok=True, plots=False,
            verbose=False)
    best = YOLO(f"/content/runs/{name}/weights/best.pt")
    v = best.val(data=str(DATA / "data.yaml"), split="val", imgsz=IMGSZ, plots=False, verbose=False)
    results[name] = {"val_mAP50": float(v.box.map50), "val_P": float(v.box.mp), "val_R": float(v.box.mr)}
    print(name, results[name])

# %%
winner = max(results, key=lambda k: results[k]["val_mAP50"])   # chosen on VAL only
best = YOLO(f"/content/runs/{winner}/weights/best.pt")
t = best.val(data=str(DATA / "data.yaml"), split="test", imgsz=IMGSZ, plots=False, verbose=False)
report = {"winner": winner, "candidates": results,
          "test": {"mAP50": float(t.box.map50), "mAP50-95": float(t.box.map), "precision": float(t.box.mp), "recall": float(t.box.mr)}}

# confidence sweep on TEST images: per-image detection (any box >= conf) vs per-image truth (has a label box)
imgs = sorted((DATA / "test" / "images").iterdir())
truth = {p.stem: (DATA / "test" / "labels" / f"{p.stem}.txt").read_text().strip() != "" for p in imgs}
preds = best.predict([str(p) for p in imgs], imgsz=IMGSZ, conf=0.05, verbose=False)
sweep = []
for conf in (0.15, 0.25, 0.35, 0.5, 0.65):
    tp = fp = fn = tn = 0
    for p, r in zip(imgs, preds):
        hit = bool((r.boxes.conf >= conf).any()) if len(r.boxes) else False
        t_ = truth[p.stem]
        tp += hit and t_; fp += hit and not t_; fn += (not hit) and t_; tn += (not hit) and not t_
    sweep.append({"conf": conf, "image_precision": tp / max(tp + fp, 1), "image_recall": tp / max(tp + fn, 1),
                  "false_alarm_rate_on_clear_images": fp / max(fp + tn, 1)})
report["image_level_sweep_on_test"] = sweep
print(json.dumps(report, indent=2))
Path("/content/cv_report.json").write_text(json.dumps(report, indent=2))

# %%
onnx_path = best.export(format="onnx", imgsz=IMGSZ, opset=17, simplify=True)
out = Path("/content/cv_results"); out.mkdir(exist_ok=True)
for f in (onnx_path, f"/content/runs/{winner}/weights/best.pt", "/content/cv_report.json", f"/content/runs/{winner}/results.csv"):
    shutil.copy(f, out)
shutil.make_archive("/content/cv_results", "zip", out)
print("Download /content/cv_results.zip and send it back")
