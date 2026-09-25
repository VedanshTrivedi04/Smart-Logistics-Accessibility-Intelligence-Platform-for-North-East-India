"""
ml-training/scripts/add_lhasa_susceptibility.py — sample NASA LHASA Global Landslide Susceptibility (0-5, 1 km)
at every row of a risk dataset (ArcGIS ImageServer identify; free, no key). NoData -> NaN (XGBoost handles it).

    python scripts/add_lhasa_susceptibility.py [in.csv] [out.csv]
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

URL = "https://gis.earthdata.nasa.gov/portal/rest/services/Landslides/Global_Landslide_Susceptibility/ImageServer/identify"
D = Path(__file__).resolve().parents[1] / "data" / "real"
CACHE = D / "cache" / "lhasa.json"


def sample(lon: float, lat: float) -> float:
    q = urllib.parse.urlencode({"geometry": json.dumps({"x": round(lon, 5), "y": round(lat, 5)}), "geometryType": "esriGeometryPoint",
                                "returnGeometry": "false", "f": "json"})
    for i in range(4):
        try:
            with urllib.request.urlopen(f"{URL}?{q}", timeout=60) as r:
                v = json.loads(r.read()).get("value")
            return float(v) if v not in (None, "NoData", "") else float("nan")
        except Exception:  # noqa: BLE001
            time.sleep(2 ** i)
    return float("nan")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else D / "real_risk_dataset_v2.csv"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else D / "real_risk_dataset_v3.csv"
    df = pd.read_csv(src)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    keys = [f"{r.longitude:.5f},{r.latitude:.5f}" for r in df.itertuples()]
    todo = sorted({k for k in keys if k not in cache})
    with ThreadPoolExecutor(6) as ex:
        for k, v in zip(todo, ex.map(lambda k: sample(*map(float, k.split(","))), todo)):
            cache[k] = None if v != v else v
    CACHE.write_text(json.dumps(cache))
    df["lhasa_susceptibility"] = [cache[k] if cache[k] is not None else float("nan") for k in keys]
    df.to_csv(dst, index=False)
    print(f"wrote {dst.name}: {len(df)} rows | NoData {df.lhasa_susceptibility.isna().mean():.1%}")
    print(df.groupby("landslide").lhasa_susceptibility.agg(["mean", "count"]).round(2))
    print(pd.crosstab(df.lhasa_susceptibility.fillna(-1), df.landslide))


if __name__ == "__main__":
    main()
