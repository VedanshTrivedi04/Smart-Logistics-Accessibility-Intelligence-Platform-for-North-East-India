# Model artifacts (gitignored)

This directory holds the binary model artifacts loaded by the `ai` module's
infrastructure adapters at runtime:

| File | Loaded by | Trained by |
|---|---|---|
| `risk_model_xgboost.pkl` | `xgboost_risk_predictor.py` | `ml-training/scripts/train_risk_model.py` |
| `eta_model_catboost.cbm` + `eta_model_metrics.json` | `catboost_eta_predictor.py` | `ml-training/scripts/train_eta_model.py` |
| `hazard_model.onnx` | `onnx_hazard_verifier.py` | `ml-training/notebooks/train_cv_hazard_model.py` |

**As of Phase 3, all four files are copies of SYNTHETIC-data-trained
artifacts** (see `ml-training/README.md`) — they prove the inference wiring
works end-to-end but must not be used for real predictions or benchmarked
against `aiml developer.md` §4's SIH targets.

If any file is missing, the corresponding adapter's factory function
(`get_risk_predictor()` / `get_eta_predictor()` / `get_hazard_verifier()`)
falls back to the Phase 0 stub adapter and logs a warning — the API stays up,
it just returns placeholder predictions.

To refresh these from a training run:

```bash
cp ../../../../ml-training/models/risk_model_xgboost.pkl .
cp ../../../../ml-training/models/eta_model_catboost.cbm .
cp ../../../../ml-training/models/eta_model_metrics.json .
cp ../../../../ml-training/models/cv_hazard_run/weights/best.onnx hazard_model.onnx
```
