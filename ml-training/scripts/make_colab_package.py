"""Build ml-training/colab/landslide_cv_colab_package.zip (merged_v3 dataset + attribution)."""
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "colab" / "landslide_cv_colab_package.zip"
DS = ROOT / "data" / "real_cv" / "merged_v3"
ATTR = ROOT / "data" / "real_cv" / "negatives_wikimedia" / "attribution.csv"
NOTE = """DATA SOURCES AND LICENCES (attribution required)
Positives - Roboflow Universe, all CC BY 4.0:
  raghava-priya/landslide-htrll ; roads-detection-with-drones/landslide-detection-2dme2 ;
  Ambit "landslide Computer Vision Dataset" ; littlepaddys Workspace "landslide"
  (some source images are stock photos - research use only; re-check before redistributing)
Negatives - Wikimedia Commons (CC BY / CC BY-SA), per-file attribution in attribution.csv
"""
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in DS.rglob("*"):
        if f.is_file() and f.name != "data.yaml":
            z.write(f, Path("merged_v3") / f.relative_to(DS))
    z.write(ATTR, "attribution.csv")
    z.writestr("SOURCES.txt", NOTE)
print(OUT, f"{OUT.stat().st_size / 1e6:.1f} MB")
