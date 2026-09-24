
# AI/ML Developer Master Blueprint & Execution Guide
## Smart Logistics & Accessibility Intelligence Platform for North-East India (SIH 2026 — Problem 26002, MDoNER)

---

## 1. Executive Summary & AI/ML Vision

### 1.1 The Problem Context
The North-Eastern Region (NER) of India suffers from severe topographical, seismic, and meteorological vulnerabilities. During monsoons, cloudbursts, heavy rainfall, and landslides frequently sever critical road arteries (e.g., NH-06 connecting Guwahati, Shillong, Silchar, and Agartala). 
Standard navigation apps (Google Maps, MapMyIndia) are optimized for normal commercial traffic; they fail to account for:
- Sudden mountain road closures (landslides, flash floods, sinking roads).
- Hill terrain vehicle dynamics (heavy trucks, oxygen tankers, pharmaceutical reefers).
- Bridge load-bearing/height restrictions.
- Lack of connectivity in remote valleys.

### 1.2 The Role of AI/ML in this Platform
Currently, the backend has a rock-solid **deterministic baseline** (PostGIS + Dijkstra routing with hard-coded road blockages and rule-based penalties).
The **AI/ML Developer's mission** is to transition the platform from a *reactive rules-based system* into a **predictive, multimodal intelligence platform**.

```
                ┌─────────────────────────────────────────────────────────┐
                │             EXTERNAL MULTIMODAL DATA INGESTION          │
                │  - IMD Weather Radar & Forecasts (Precipitation)        │
                │  - GSI Bhusanket (Landslide Susceptibility & Inventories)│
                │  - NASA SRTM / Copernicus DEM (Elevation, Slope, Aspect)│
                │  - OpenStreetMap (OSM) Graph Topology & Road Surface    │
                │  - Telemetry (AIS-140 GPS Speeds, Historical Traversal) │
                └────────────────────────────┬────────────────────────────┘
                                             │
                                             ▼
                ┌─────────────────────────────────────────────────────────┐
                │                   AI / ML SUBSYSTEMS                    │
                ├─────────────────────────────────────────────────────────┤
                │ 1. CV Hazard Verification Model (YOLOv8 / CLIP)         │
                │    Analyzes field photos: Landslide, Waterlog, Severity │
                │ 2. Predictive Road Disruption Model (XGBoost / LightGBM)│
                │    Predicts P(Blocked | Rainfall, Slope, Soil, Horizon) │
                │ 3. Mountain Traversal ETA & Delay Predictor (ST-GNN)   │
                │    Models hill climbing delays, rain slowdown, gradient │
                │ 4. Multilingual Speech & NLP Assistant (Bhashini Pipeline│
                │    Voice-based report transcription & regional alerts   │
                │ 5. Dynamic Logistics Optimization Engine (OR-Tools / RL)│
                │    Multi-stop hospital delivery re-routing & allocation│
                └────────────────────────────┬────────────────────────────┘
                                             │
                                             ▼
                ┌─────────────────────────────────────────────────────────┐
                │          FASTAPI BACKEND INTEGRATION & OUTBOX           │
                │  Exposes REST APIs & Async Inference Workers            │
                │  Updates Edge Weights in PostGIS / pgRouting            │
                │  Triggers Proactive Alerts & Dispatch Recommendations   │
                └─────────────────────────────────────────────────────────┘
```

---

## 2. Core AI/ML Modules Architecture & Task Breakdown

### Module 1: Computer Vision Field Report Verification Engine
- **Objective**: Automatically verify, classify, and rate the severity of incident photos submitted by field officers (or citizens) offline, filtering out spam or irrelevant photos before human adjudication.
- **Input**: JPEG/PNG image, GPS coordinates, timestamp.
- **Output**: 
  - `hazard_detected`: bool
  - `hazard_class`: `LANDSLIDE` | `FLOOD_WATERLOGGING` | `ROAD_DAMAGE_CRACK` | `TREE_FALL` | `CLEAR_ROAD`
  - `severity_score`: float [0.0 - 1.0] (Minor, Moderate, Critical Blockage)
  - `is_roadway_blocked`: bool
  - `confidence`: float
- **Model Choice**:
  - Primary: Fine-tuned **YOLOv8x / YOLOv11** on Indian road/mountain disaster datasets.
  - Secondary/Alternative: **CLIP / OpenCLIP (ViT-B/32)** zero-shot classification for anomaly detection and adversarial image rejection (e.g. photos of indoor screens, unrelated memes).
- **Tasks for Developer**:
  1. *Dataset Sourcing*: Download DisasterScene datasets (e.g., AIDER, CrisisMMD, Landslide4Sense, and custom crawled NH-6 landslide imagery).
  2. *Data Labeling & Augmentation*: Apply rain artifacts, fog simulation, low-light augmentation (mountain weather conditions).
  3. *Training Script*: Train in PyTorch/Ultralytics with cross-entropy and bounding box loss.
  4. *Inference Service*: Wrap into an ONNX-runtime / TensorRT microservice or FastAPI worker job.

---

### Module 2: Spatiotemporal Disruption & Landslide Risk Prediction Model
- **Objective**: Predict the probability of a road edge getting blocked within a specific forecast horizon ($T \in [3\text{h}, 6\text{h}, 12\text{h}, 24\text{h}]$) before the blockage physically happens.
- **Target Variable**: $P(\text{Blocked} = 1 \mid \text{Edge } e, \text{Horizon } T)$.
- **Feature Pipeline (Feature Store)**:
  1. **Static Topographical Features** (via NASA SRTM / ALOS PALSAR DEM):
     - Edge elevation (min, max, mean, gradient/slope percentage).
     - Curvature and aspect (slope direction vs monsoon wind direction).
     - Soil type and lithology (GSI Bhusanket susceptibility zone: Low, Medium, High, Very High).
     - Distance to nearest river/stream (drainage basin vulnerability).
  2. **Dynamic Meteorological Features** (via IMD API & GFS/ERA5 Reanalysis):
     - Cumulative rainfall past 24h, 48h, 72h (Antecedent Rainfall Index - ARI).
     - Forecasted rainfall intensity in next 3h, 6h, 12h ($mm/hr$).
     - Soil moisture saturation index.
  3. **Operational Road Features**:
     - Highway class (`primary`, `trunk`, `secondary`).
     - Historical incident count on edge $e$ in past seasons.
     - Road surface condition (`paved`, `unpaved`).
- **Model Choice**:
  - Baseline: **XGBoost / LightGBM** with Bayesian Hyperparameter Optimization.
  - Advanced: **Spatio-Temporal Graph Neural Network (ST-GNN)** or **Temporal Graph Convolutional Network (T-GCN)** where nodes are intersections and edges are road segments carrying dynamic rainfall states.
- **Evaluation Metrics**:
  - PR-AUC (Precision-Recall AUC), Brier Score (Calibration is critical: high false alarms destroy driver trust).
  - Target: Recall $\ge 85\%$ for High-Risk landslides with False Positive Rate $< 12\%$.

---

### Module 3: Mountain Vehicle Traversal ETA & Delay Predictor
- **Objective**: Replace standard flat-speed estimates with realistic, terrain-aware, weather-impacted transit times for commercial transport (heavy multi-axle trucks carrying humanitarian relief).
- **Features**:
  - Road length, elevation gain/loss (hill-climbing drag).
  - Number of hairpin bends / tortuosity index (calculated from PostGIS linestring curvature).
  - Current weather status (rainfall rate $mm/hr$, visibility).
  - Vehicle specifications: Gross Vehicle Weight (GVW), Engine Power (HP), Cargo Class.
- **Model Choice**:
  - Gradient Boosted Regression (CatBoost with monotonic constraints on road slope and rain intensity).
  - Yields: Point estimate $\mu_{\text{time}}$ and 95% Confidence Interval $[\tau_{\text{min}}, \tau_{\text{max}}]$.

---

### Module 4: Bhashini Voice & Multilingual NLP Pipeline
- **Objective**: Bridge the literacy and dialect gap across the 8 North-Eastern states (Assamese, Bengali, Bodo, Manipuri, Khasi, Mizo, Nepali, Hindi, English).
- **Capabilities**:
  1. **Voice-to-Report (ASR)**: Field officer speaks report into mobile app: *"Mawryngkneng ke paas bada landslide hua hai, NH-6 poora band hai"* -> Auto-transcribed & translated into structured English JSON.
  2. **Named Entity Recognition (NER)**: Extract `Location`, `Hazard_Type`, `Severity`, `Obstruction_Status`.
  3. **Text-to-Speech (TTS) Alerts**: Automated regional voice calls and audio broadcast alerts to drivers approaching danger zones.
- **Tech Stack**:
  - National Language Translation Mission **Bhashini ULCA API** (`POST /services/inference/translation`, `/services/inference/asr`, `/services/inference/tts`).
  - Fallback offline: Whisper-Tiny ONNX (quantized) for on-device edge transcription.

---

### Module 5: Multi-Objective Emergency Logistics Optimization
- **Objective**: Dynamic dispatching and re-routing when high-risk weather or an active blockage cuts off normal supply chains.
- **Formulation**: Capacitated Vehicle Routing Problem with Time Windows and Disruption Risks (CVRPTW-R).
- **Objective Function**:
  $$\min \sum_{k} \left( w_1 \cdot \text{TravelTime}_k + w_2 \cdot \text{DisruptionRisk}_k + w_3 \cdot \text{CriticalSupplyUnmetPenalty} \right)$$
- **Tech Stack**:
  - Google OR-Tools (Constraint Programming & Vehicle Routing solver).
  - Integrated directly with PostGIS distance matrix and real-time risk scores from Module 2.

---

## 3. Step-by-Step AI/ML Development Workflow

### Phase 1: Environment Setup & Tooling
1. Setup Python 3.11 virtual environment with Poetry / UV:
   ```bash
   poetry add torch torchvision torchaudio --index https://download.pytorch.org/whl/cu121
   poetry add ultralytics xgboost lightgbm catboost scikit-learn shap ortools geopandas shapely rasterio pyproj
   poetry add fastapi uvicorn onnxruntime-gpu
   ```
2. Setup MLflow / Weights & Biases for experiment tracking.
3. Setup DVC (Data Version Control) for tracking satellite DEM rasters and image datasets.

### Phase 2: Data Engineering & Feature Store Construction
1. **DEM Extraction**:
   - Download SRTM 30m DEM for Assam-Meghalaya corridor (Bounding box: `[25.0, 91.0, 26.5, 92.5]`).
   - Use `rasterio` and `geopandas` to calculate slope, elevation, and aspect for each road edge geometry in `road_edges` table.
2. **Weather Feature Ingestion**:
   - Ingest IMD gridded daily/hourly rainfall data.
   - Compute Antecedent Rainfall Index:
     $$ARI_t = \sum_{i=1}^{k} \alpha^i \cdot R_{t-i}$$
     where $\alpha = 0.85$ (soil decay coefficient), $k=7$ days.
3. **Historical Disaster Catalog**:
   - Compile past 10 years GSI / State Disaster Management Authority landslide event coordinates.

### Phase 3: Model Training & Rigorous Validation
1. **Preventing Data Leakage**:
   - **Crucial Rule**: NEVER split randomly on spatiotemporal data!
   - Use **Spatial-Temporal Block Holdout**:
     - *Temporal Split*: Train on monsoons of 2021-2024; Test on monsoon of 2025.
     - *Spatial Split*: Hold out entire highway segments (e.g. Jorabat-Nongpoh section) to test out-of-corridor generalization.
2. **Explainability**:
   - Use SHAP (SHapley Additive exPlanations) values to output human-interpretable rationale for every prediction:
     *(e.g., "Edge risk elevated to 78% due to: 3-day rainfall 140mm [SHAP +0.42] + Steep slope 34° [SHAP +0.28]").*

### Phase 4: Production Deployment & Backend Integration
1. **Export Models**:
   - Export PyTorch/YOLO and XGBoost models to **ONNX** (`.onnx`) with INT8 or FP16 quantization for low-latency inference ($< 25\text{ms}$).
2. **Create AI Service Endpoints in Backend**:
   - `POST /api/v1/ai/predict-risk` -> accepts edge IDs or bbox, returns disruption probabilities.
   - `POST /api/v1/ai/verify-photo` -> accepts image binary, returns hazard classification & bounding boxes.
   - `POST /api/v1/ai/estimate-eta` -> accepts route edges + vehicle profile, returns calibrated travel time.
   - `POST /api/v1/ai/transcribe-voice` -> accepts audio wav, returns translated structured report.
3. **Outbox & Periodic Worker Integration**:
   - Celery/Worker job runs every 30 minutes: queries current weather from IMD -> computes updated edge risks -> writes to `risk_assessments` table in PostgreSQL -> triggers route invalidation if risk threshold exceeds configured tolerance.

---

## 4. Evaluation Standards & SIH Winning Criteria

| Dimension | Minimum Viable Threshold | SIH Competition Winning Target |
|---|---|---|
| **CV Hazard Detection** | F1-Score: 0.75 | F1-Score: **0.91+**, latency $< 80\text{ms}$ on GPU |
| **Landslide Risk Prediction** | PR-AUC: 0.65, Brier: 0.18 | PR-AUC: **0.84+**, Brier: **$< 0.08$**, calibrated probabilities |
| **ETA Mountain Accuracy** | MAPE $< 25\%$ | MAPE **$< 9.5\%$** across varied vehicle payloads |
| **Multilingual Voice (Bhashini)** | WER $< 30\%$ for Hindi/Assamese | WER **$< 14\%$** with domain-adapted logistics lexicon |
| **Explainability** | Raw confidence score | **Full SHAP feature contribution bar chart** in government UI |

---

## 5. Phase-Wise Execution Roadmap (Where to Actually Start)

This section grounds §2-4 into a concrete build order against the **real backend layout** (`backend/app/modules/{identity,network,reporting,incidents,logistics,telemetry,routing,impact}/`, each split into `domain/ → application/ → infrastructure/ → api/` with a `public.py` facade, enforced by `backend/boundries.py`). Do not skip Phase 0 — writing ML code that violates the boundary checker will fail CI immediately.

### Key integration points (read this before writing any code)
- **New module, not a bolt-on**: All AI/ML code lives in a new `backend/app/modules/ai/`, mirroring the same `domain/application/infrastructure/api` split as every other module.
  - `ai/domain/` → pure feature-math (ARI formula, slope calc, calibration curves). No torch/xgboost/onnxruntime imports allowed here.
  - `ai/application/` → use cases + port interfaces only (e.g. `RiskPredictorPort`, `HazardVerifierPort`, `ETAPredictorPort`). No direct model loading here either.
  - `ai/infrastructure/` → the ONLY layer allowed to import torch/xgboost/onnxruntime/ultralytics. Implements the ports.
  - `ai/api/` → the four `/api/v1/ai/*` FastAPI routers from §3 Phase 4.
- **Network module owns the graph**: `network/public.py` exposes `EdgeStatusRepositoryPort`, `EdgeStatusEvent`, `RoadEdge`, `TraversabilityResult`. The risk model never touches PostGIS directly — it writes predictions as new `EdgeStatusEvent` rows through this port.
- **Reporting module owns field photos**: `reporting/public.py` today only exposes `get_report(report_id)`. The CV verification model needs a new use case added *inside* reporting (or a port reporting exposes to `ai`) to write back `hazard_class` / `severity_score` / `is_roadway_blocked`.
- **Routing module owns ETA/weights**: `routing/public.py` has `VehicleConstraints`, `RouteEdge`, `EvaluateRouteUseCase`. The ETA predictor plugs in as an alternate edge-weight/duration source *consumed by* routing — it does not replace routing's own logic.

### Phase 0 — Environment & Contracts (2-3 days)
1. Add the ML stack from §3 Phase 1 to `backend/pyproject.toml` as an **optional dependency group** (`[tool.poetry.group.ml]`) so the core API can still boot without torch/xgboost installed.
2. Scaffold `backend/app/modules/ai/{domain,application,infrastructure,api}/` + `public.py`, matching sibling modules exactly (look at `network/` as the template).
3. Define port interfaces first in `ai/application/ports.py` — pure Python `Protocol`/`ABC`, zero ML imports. This lets `routing`/`reporting` depend on `ai/public.py` without ever transitively importing torch/xgboost.
4. Run `python backend/boundries.py` right after scaffolding — confirm zero violations before writing a single line of real model logic.

### Phase 1 — Data Engineering Foundation (~1 week)
1. Write a DEM ingestion script under `backend/app/scripts/` (follow the existing `load_pilot_corridor.py` pattern) to compute slope/elevation/aspect per `road_edges` row.
2. Stage these as a **new** Alembic migration `007_ai_feature_store.py` (new feature-store table, do NOT touch `003_network_schema.py`).
3. Ingest IMD rainfall data → compute the Antecedent Rainfall Index (ARI, §3 Phase 2 formula) per edge, store in the same feature table.
4. Compile the historical GSI landslide catalog as labeled ground truth for Module 2 training.
   - **This is the critical path item.** Start sourcing it in parallel with Phase 0 — everything in Phase 2 downstream is blocked on having labeled data.

### Phase 2 — Model Training (offline, outside the backend repo — ~2 weeks)
Train in notebooks / Google Colab, not inside `backend/`:
1. **Module 2 (risk)** — XGBoost/LightGBM on the Phase 1 feature store. Use the spatial-temporal block holdout from §3 Phase 3 — never a random split.
2. **Module 1 (CV)** — YOLOv8 fine-tune on a free Colab/Kaggle T4 GPU, export to ONNX with FP16 quantization.
3. **Module 3 (ETA)** — CatBoost regression with monotonic slope/rain constraints.
Version every model in DVC/MLflow, export to `.onnx`/`.pkl`, and drop the artifacts into `backend/app/modules/ai/infrastructure/models/`.

### Phase 3 — Inference Wiring into the Backend (~1 week)
1. `ai/infrastructure/` implements the Phase 0 ports using onnxruntime/xgboost loaders.
2. `ai/application/` use cases: `PredictEdgeRiskUseCase`, `VerifyHazardPhotoUseCase`, `EstimateETAUseCase` — call the port, then write results back via `EdgeStatusRepositoryPort` (network) or the new reporting port.
3. `ai/api/` exposes the four REST endpoints from §3 Phase 4, registered in `backend/app/main.py` alongside the existing routers.
4. Add contract/integration tests under `backend/tests/integration/`, mirroring the existing per-module test structure.

### Phase 4 — Periodic Worker & Route Invalidation (3-4 days)
1. Add a Celery/worker job beside the existing `backend/app/workers/`: every 30 min, pull weather → call `PredictEdgeRiskUseCase` → write `EdgeStatusEvent` via network's port → if risk crosses threshold, trigger the existing routing-invalidation path (already scaffolded in `006_routing_impact_schema.py`).
2. Pure integration work — no new ML here, just wiring Phase 3's use cases into the existing dispatch/outbox flow.

### Phase 5 — Bhashini + Logistics Optimization (parallel track, ~1 week)
Lower risk; can run in parallel with Phases 2-4 since it doesn't touch the feature store:
1. Bhashini ULCA API wrapper in `ai/infrastructure/` for ASR/NER/TTS, feeding structured reports into the existing `reporting` module's field-report creation use case.
2. OR-Tools CVRPTW solver reading risk scores from Phase 3's `PredictEdgeRiskUseCase` output plus the existing `logistics` module's vehicle/delivery entities.

### Critical Path Summary
Phase 1 (data, especially the GSI landslide catalog) gates Phase 2, which gates everything downstream on the risk model. **Start Phase 1 sourcing today**, even before Phase 0 finishes — it is the true bottleneck for hitting the §4 evaluation targets.

---
*Created for the SIH 2026 AI/ML Engineering Team. Follow all architectural boundaries defined in `backend/boundries.py` and `systemarchitecture.md`.*
