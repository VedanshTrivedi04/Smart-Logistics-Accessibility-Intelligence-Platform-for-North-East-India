"""
app/modules/ai/infrastructure/onnx_hazard_verifier.py — Hazard verifier adapter.

Two implementations:
  - StubOnnxHazardVerifier: fixed "no hazard, low confidence" result (Phase 0).
    Used as an automatic fallback when no model artifact is present.
  - OnnxHazardVerifier: loads a real YOLOv8 model exported to ONNX and runs
    inference via onnxruntime, decoding raw (untraced-NMS) YOLOv8 output —
    box rows in pixel space, per-class confidence rows already sigmoid-applied
    (verified empirically against this project's exported model) — followed
    by manual confidence thresholding and greedy IoU-based NMS. As of Phase 3,
    the only artifact available was trained for 1 epoch on tiny SYNTHETIC
    images with a single undifferentiated "hazard_blob" class (see
    ml-training/README.md) — the decode pipeline is real and will work
    unchanged on a real 5-class model; the current model's predictions are not
    meaningful.

Preprocessing is a letterbox (aspect-preserving resize + grey 114 padding), identical to
Ultralytics' training/validation pipeline; a plain squashing resize measurably hurts accuracy.
`is_roadway_blocked` is only asserted for detections with confidence >= BLOCKED_MIN_CONFIDENCE, and
a model that does not know the CLEAR_ROAD class reports `detectable_classes` so callers can tell
"no landslide found" apart from "road is clear".

Class-name resolution reads the `names` mapping embedded in the ONNX model's
metadata by Ultralytics' exporter, so once a real model is trained with class
names matching HazardClass's enum values (LANDSLIDE, FLOOD_WATERLOGGING,
ROAD_DAMAGE_CRACK, TREE_FALL, CLEAR_ROAD), this same code resolves them
correctly with no changes.

get_hazard_verifier() is the single entry point api/routes.py should use.
"""

from __future__ import annotations

import ast
import io
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from app.core.logging import get_logger
from app.modules.ai.application.ports import HazardVerifierPort
from app.modules.ai.domain.entities import HazardVerification
from app.modules.ai.domain.enums import HazardClass, ModelStatus
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError, ModelNotLoadedError

if TYPE_CHECKING:  # Pillow is an optional (ml extra) dependency, imported lazily at runtime
    from PIL import Image

logger = get_logger(__name__)

MODEL_PATH = Path(__file__).resolve().parent / "models" / "hazard_model.onnx"

# Chosen on the validation split (max F2) for the real landslide model, see
# ml-training/scripts/eval_onnx_verifier.py. The score is a raw detector score, NOT a calibrated
# probability (this model rarely exceeds 0.5), so the threshold is low by design.
CONFIDENCE_THRESHOLD = 0.10
IOU_THRESHOLD = 0.45
# A detection must be at least this confident before we claim the roadway is blocked (a landslide
# somewhere in the frame does not by itself mean the road is blocked).
BLOCKED_MIN_CONFIDENCE = 0.50
LETTERBOX_FILL = 114

# Fallback used when a detected class name doesn't match any HazardClass member
# (true today: the only trained model has a single undifferentiated
# "hazard_blob" class, not the real 5-class taxonomy).
_UNRECOGNIZED_CLASS_FALLBACK = HazardClass.ROAD_DAMAGE_CRACK


class StubOnnxHazardVerifier(HazardVerifierPort):
    """Stub adapter for HazardVerifierPort. No model artifact loaded."""

    async def verify(self, image_bytes: bytes) -> HazardVerification:
        return HazardVerification(
            hazard_detected=False,
            hazard_class=HazardClass.CLEAR_ROAD,
            severity_score=0.0,
            is_roadway_blocked=False,
            confidence=0.0,
            model_status=ModelStatus.STUB,
        )


def _iou(box_a: np.ndarray, box_b: np.ndarray) -> float:
    """IoU between two (x1, y1, x2, y2) boxes."""
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - intersection
    return intersection / union if union > 0.0 else 0.0


def _greedy_nms(boxes_xyxy: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
    """Class-agnostic greedy NMS. Returns indices to keep, highest score first."""
    order = list(np.argsort(-scores))
    keep: list[int] = []
    while order:
        current = order.pop(0)
        keep.append(current)
        order = [i for i in order if _iou(boxes_xyxy[current], boxes_xyxy[i]) < iou_threshold]
    return keep


def decode_yolov8_output(
    raw_output: np.ndarray,
    class_names: dict[int, str],
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
    iou_threshold: float = IOU_THRESHOLD,
) -> list[tuple[str, float]]:
    """
    Decode a raw YOLOv8 ONNX output tensor (shape (1, 4+nc, num_boxes)) into a
    list of (class_name, confidence) for surviving detections, highest
    confidence first. Pure function — no ONNX/session dependency — so it can
    be unit-tested with a synthetic tensor.
    """
    output = raw_output[0]  # (4+nc, num_boxes)
    boxes_cxcywh = output[0:4, :].T  # (num_boxes, 4)
    class_scores = output[4:, :]  # (nc, num_boxes)

    best_class_idx = np.argmax(class_scores, axis=0)  # (num_boxes,)
    best_scores = class_scores[best_class_idx, np.arange(class_scores.shape[1])]

    survivors = np.where(best_scores >= confidence_threshold)[0]
    if survivors.size == 0:
        return []

    cx, cy, w, h = (
        boxes_cxcywh[survivors, 0],
        boxes_cxcywh[survivors, 1],
        boxes_cxcywh[survivors, 2],
        boxes_cxcywh[survivors, 3],
    )
    boxes_xyxy = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
    scores = best_scores[survivors]
    class_indices = best_class_idx[survivors]

    keep = _greedy_nms(boxes_xyxy, scores, iou_threshold)

    return [
        (class_names.get(int(class_indices[i]), "UNKNOWN"), float(scores[i]))
        for i in sorted(keep, key=lambda idx: scores[idx], reverse=True)
    ]


def max_class_score(raw_output: np.ndarray) -> float:
    """Highest per-box class score in a raw YOLOv8 output tensor (0.0 when there are no boxes)."""
    scores = raw_output[0][4:, :]
    return float(scores.max()) if scores.size else 0.0


def letterbox(image: Image.Image, width: int, height: int) -> np.ndarray:
    """Aspect-preserving resize + centred grey padding -> float32 NCHW in [0, 1]."""
    from PIL import Image as PILImage

    ratio = min(width / image.width, height / image.height)
    new_w, new_h = max(1, round(image.width * ratio)), max(1, round(image.height * ratio))
    resized = image.resize((new_w, new_h), PILImage.Resampling.BILINEAR)
    canvas = PILImage.new("RGB", (width, height), (LETTERBOX_FILL,) * 3)
    canvas.paste(resized, ((width - new_w) // 2, (height - new_h) // 2))
    array = np.asarray(canvas, dtype=np.float32) / 255.0
    return np.transpose(array, (2, 0, 1))[None, ...]


def _resolve_hazard_class(class_name: str) -> HazardClass:
    try:
        return HazardClass(class_name.upper())
    except ValueError:
        return _UNRECOGNIZED_CLASS_FALLBACK


class OnnxHazardVerifier(HazardVerifierPort):
    """Real adapter for HazardVerifierPort, backed by a YOLOv8 ONNX export."""

    def __init__(self, model_path: Path) -> None:
        if not model_path.exists():
            raise ModelNotLoadedError(f"Hazard model artifact not found at {model_path}")

        import onnxruntime as ort

        self.session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        input_shape = self.session.get_inputs()[0].shape
        self.input_height, self.input_width = int(input_shape[2]), int(input_shape[3])

        metadata = self.session.get_modelmeta().custom_metadata_map
        names_repr = metadata.get("names", "{}")
        self.class_names: dict[int, str] = ast.literal_eval(names_repr)
        self.detectable_classes: tuple[str, ...] = tuple(
            sorted(
                {
                    n.upper()
                    for n in self.class_names.values()
                    if n.upper() in HazardClass.__members__
                }
            )
        )

    async def verify(self, image_bytes: bytes) -> HazardVerification:
        if not image_bytes:
            raise InvalidFeatureVectorError("image_bytes must not be empty")

        from PIL import Image as PILImage

        try:
            image = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            raise InvalidFeatureVectorError(f"Could not decode image: {exc}") from exc

        array = letterbox(image, self.input_width, self.input_height)

        raw_output = self.session.run(None, {self.input_name: array})[0]
        detections = decode_yolov8_output(raw_output, self.class_names)

        if not detections:
            return HazardVerification(
                hazard_detected=False,
                hazard_class=HazardClass.CLEAR_ROAD,
                severity_score=0.0,
                is_roadway_blocked=False,
                confidence=1.0 - max_class_score(raw_output),
                model_status=ModelStatus.LOADED,
                detectable_classes=self.detectable_classes,
            )

        best_class_name, best_score = detections[0]
        hazard_class = _resolve_hazard_class(best_class_name)
        is_clear = hazard_class == HazardClass.CLEAR_ROAD

        return HazardVerification(
            hazard_detected=not is_clear,
            hazard_class=hazard_class,
            severity_score=0.0 if is_clear else best_score,
            is_roadway_blocked=(not is_clear) and best_score >= BLOCKED_MIN_CONFIDENCE,
            confidence=best_score,
            model_status=ModelStatus.LOADED,
            detectable_classes=self.detectable_classes,
        )


@lru_cache(maxsize=1)
def get_hazard_verifier() -> HazardVerifierPort:
    """Load the real hazard verifier once per process, falling back to the stub."""
    try:
        return OnnxHazardVerifier(MODEL_PATH)
    except ModelNotLoadedError:
        logger.warning("hazard_model_not_found_using_stub", model_path=str(MODEL_PATH))
    except ImportError as exc:
        logger.warning("hazard_model_deps_missing_using_stub", error=str(exc))
    return StubOnnxHazardVerifier()
