# ml-training

Standalone workspace for **Phase 2** offline model training (`aiml developer.md` §3
Phase 3). This is intentionally **outside** `backend/` — nothing here is deployed;
only exported `.onnx`/`.pkl`/`.cbm` model artifacts cross into
`backend/app/modules/ai/infrastructure/models/` during Phase 3.

## Status: pipelines proven correct on SYNTHETIC data — NOT yet trained on real data

Every script here has been run successfully end-to-end in this workspace, but
**all training data used so far is synthetic** (generated, not real). This
proves the pipeline mechanics work (feature joins, the mandatory
spatial-temporal holdout, evaluation metrics, SHAP explainability, model
export) but says nothing about real-world accuracy. Do not deploy or
benchmark against `aiml developer.md` §4's SIH targets using these artifacts.

| Script | Model | Proven with synthetic data? | Blocked on |
|---|---|---|---|
| `scripts/train_risk_model.py` | XGBoost risk classifier (Module 2) | Yes — runs, PR-AUC/Brier/SHAP all compute correctly | Real GSI landslide catalog + real terrain/weather feature-store export |
| `scripts/train_eta_model.py` | CatBoost ETA regressor (Module 3) | Yes — runs, monotonic constraints hold, MAPE computes correctly | Real trip-duration telemetry |
| `notebooks/train_cv_hazard_model.py` | YOLOv8 hazard detector (Module 1) | Yes — full train→val→export(ONNX) cycle verified on CPU with tiny synthetic images | Real GPU (Colab/Kaggle) + real labeled hazard imagery |

## Setup

```bash
cd ml-training
python -m venv .venv   # or: uv venv --python 3.13 .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
# .venv/bin/pip install -r requirements.txt     # macOS/Linux
```

For Module 1 (CV), also install `ultralytics` (pulls in `torch`/`torchvision`;
CPU wheels are fine for the smoke test, but real training needs a GPU runtime
such as Colab):

```bash
.venv/Scripts/pip install ultralytics
```

## Generating the synthetic smoke-test data

```bash
python scripts/generate_synthetic_dataset.py       # tabular: risk + ETA CSVs
python scripts/generate_synthetic_cv_dataset.py     # tiny YOLO-format image set
```

## Running the training scripts

```bash
python scripts/train_risk_model.py
python scripts/train_eta_model.py
python notebooks/train_cv_hazard_model.py   # CPU smoke test only
```

Each script writes its trained artifact + a metrics JSON into `models/`
(gitignored — these are synthetic-data artifacts, not meant to be committed).

## Swapping in real data

1. **Risk model**: export `backend`'s `edge_terrain_features` +
   `edge_weather_features` + `landslide_events` tables (joined on `edge_id`,
   with a real corridor-segment label and monsoon-year derived from
   `occurred_at`) to a CSV with the same columns as
   `generate_synthetic_dataset.generate_synthetic_edge_features()`, then:
   ```bash
   python scripts/train_risk_model.py --data-path <real_export.csv>
   ```
2. **ETA model**: export real trip durations from `backend`'s `telemetry`
   module joined with edge geometry/vehicle data, matching the column names
   in `generate_synthetic_dataset.generate_synthetic_eta_dataset()`, then:
   ```bash
   python scripts/train_eta_model.py --data-path <real_export.csv>
   ```
3. **CV model**: source real imagery (AIDER, CrisisMMD, Landslide4Sense, or
   custom NH-6 field photos — see `aiml developer.md` §2 Module 1 for
   sources), label it in YOLO format for the 5 real hazard classes, open
   `notebooks/train_cv_hazard_model.py` in Google Colab with a T4 GPU
   runtime, point `DATA_YAML_PATH` at the real `data.yaml`, raise `EPOCHS` to
   50-100 and `IMAGE_SIZE` to 640, and run.

## Critical path update

The official **GSI Bhusanket inventory** is still not sourced — GSI's public
portal has no bulk download; obtaining it requires directly emailing GSI's
Landslide Studies Division (`dir.ghrm.landslide@gsi.gov.in`), a manual step
for the team, not something automatable.

In the meantime, a **real (non-synthetic) substitute landslide catalog** has
been sourced: 320 actual NER-region landslide events (2007-2016) from NASA's
public Global Landslide Catalog. See
`../data/landslide_catalog/README.md` for full provenance, and
`backend/app/scripts/fetch_nasa_glc_landslide_catalog.py` +
`backend/app/scripts/load_landslide_catalog.py` to fetch/load it. This
unblocks real Module 2 training on real labels today — the still-open task is
real DEM terrain features + real IMD rainfall features per edge (both need a
live database), plus eventually merging in GSI's own inventory once received.
