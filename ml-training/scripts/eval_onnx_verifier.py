"""
ml-training/scripts/eval_onnx_verifier.py — image-level evaluation of an exported hazard ONNX through the
BACKEND's own preprocessing (letterbox) + onnxruntime session, so we measure what production will do.

Threshold is chosen on VAL only (maximise F2, i.e. recall-weighted: a missed landslide costs more than a
review of a false alarm) and then reported ONCE on TEST.

    python scripts/eval_onnx_verifier.py <path/to/best.onnx> [merged_v3]
"""
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "backend"))
from app.modules.ai.infrastructure.onnx_hazard_verifier import OnnxHazardVerifier, letterbox, max_class_score  # noqa: E402


def scores(v: OnnxHazardVerifier, split_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    s, y = [], []
    for img in sorted((split_dir / "images").iterdir()):
        arr = letterbox(Image.open(io.BytesIO(img.read_bytes())).convert("RGB"), v.input_width, v.input_height)
        s.append(max_class_score(v.session.run(None, {v.input_name: arr})[0]))
        y.append((split_dir / "labels" / f"{img.stem}.txt").read_text().strip() != "")
    return np.array(s), np.array(y)


def metrics(s: np.ndarray, y: np.ndarray, t: float) -> dict[str, float]:
    hit = s >= t
    tp, fp, fn, tn = (hit & y).sum(), (hit & ~y).sum(), (~hit & y).sum(), (~hit & ~y).sum()
    p, r = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    return {"t": t, "precision": p, "recall": r, "false_alarm": fp / max(fp + tn, 1),
            "f2": 5 * p * r / max(4 * p + r, 1e-9), "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn)}


def main() -> None:
    v = OnnxHazardVerifier(Path(sys.argv[1]))
    data = ROOT / "data" / "real_cv" / (sys.argv[2] if len(sys.argv) > 2 else "merged_v3")
    print("model input", v.input_width, "x", v.input_height, "| classes", v.class_names, "| detectable", v.detectable_classes)
    sv, yv = scores(v, data / "valid")
    st, yt = scores(v, data / "test")
    grid = [round(x, 2) for x in np.arange(0.05, 0.71, 0.05)]
    print(f"\nVAL  ({int(yv.sum())} landslide + {int((~yv).sum())} clear images)")
    rows = [metrics(sv, yv, t) for t in grid]
    for m in rows:
        print(f"  t={m['t']:.2f} P={m['precision']:.2f} R={m['recall']:.2f} FA={m['false_alarm']:.3f} F2={m['f2']:.2f}")
    best = max(rows, key=lambda m: m["f2"])
    print(f"\n>> threshold chosen on VAL (max F2): {best['t']}")
    for name, m in (("VAL @chosen", metrics(sv, yv, best["t"])), ("TEST @chosen", metrics(st, yt, best["t"]))):
        print(f"{name}: P={m['precision']:.3f} R={m['recall']:.3f} false_alarm={m['false_alarm']:.3f} (tp={m['tp']} fp={m['fp']} fn={m['fn']} tn={m['tn']})")
    print(f"TEST ({int(yt.sum())} landslide + {int((~yt).sum())} clear): for reference @0.25 ->", {k: round(x, 3) for k, x in metrics(st, yt, 0.25).items() if k in ('precision', 'recall', 'false_alarm')})


if __name__ == "__main__":
    main()
