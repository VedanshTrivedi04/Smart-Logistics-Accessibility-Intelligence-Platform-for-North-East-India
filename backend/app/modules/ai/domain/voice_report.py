"""
app/modules/ai/domain/voice_report.py — pure rules: voice-note transcript -> field report.

Bhashini provides ASR + translation only (no entity extraction), so the report fields are decided
conservatively here:
  * `report_type` may be *suggested* from keywords when the officer did not choose one. The
    suggestion is a convenience for the reviewer, never an authority - the API flags it as inferred.
  * `severity` is NEVER inferred from speech. An unspecified severity defaults to MEDIUM.
  * HIGH/CRITICAL severity requires an explicit report_type (`require_explicit_type_for_severity`),
    because Reporting's Policy 21 auto-escalates LANDSLIDE/FLOODING/BRIDGE_COLLAPSE at those
    severities and a mis-heard keyword must not be able to trigger it.
"""

from __future__ import annotations

import re

from app.modules.ai.domain.entities import VoiceTranscript
from app.modules.ai.domain.exceptions import VoiceReportInputError

MAX_DESCRIPTION_CHARS = 2000  # matches the Reporting API contract
DEFAULT_SEVERITY = "MEDIUM"
VOICE_REPORT_PREFIX = "[Voice report - auto-transcribed, unverified]"
TEXT_REPORT_PREFIX = "[Text report - machine-translated, unverified]"
FALLBACK_REPORT_TYPE = "OTHER"

# Checked in order; first hit wins. English (translation output) plus Hindi/Bengali (source).
_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    (
        "BRIDGE_COLLAPSE",
        (
            "bridge collapse",
            "bridge is broken",
            "bridge broken",
            "broken bridge",
            "bridge washed",
            "bridge collapsed",
            "bridge has collapsed",
            "पुल टूट",
            "पुल गिर",
            "সেতু ভেঙ",
            "সেতু ধস",
        ),
    ),
    (
        "LANDSLIDE",
        (
            "landslide",
            "land slide",
            "landslip",
            "mudslide",
            "rockfall",
            "rock fall",
            "भूस्खलन",
            "पहाड़ खिसक",
            "मलबा",
            "ভূমিধস",
            "পাহাড় ধস",
        ),
    ),
    (
        "FLOODING",
        ("flood", "waterlogg", "water logging", "inundat", "बाढ़", "बाढ", "जलभराव", "বন্যা", "জলাবদ্ধ"),
    ),
    (
        "TREE_FALL",
        ("tree fell", "tree has fallen", "fallen tree", "tree fall", "पेड़ गिर", "पेड़ टूट", "গাছ পড়"),
    ),
    (
        "ROAD_DAMAGE",
        (
            "road damage",
            "damaged road",
            "pothole",
            "road cave",
            "crack in the road",
            "सड़क टूट",
            "सड़क धंस",
            "रास्ता टूट",
            "রাস্তা ভেঙ",
        ),
    ),
    ("WEATHER_HAZARD", ("heavy rain", "cloudburst", "storm", "भारी बारिश", "बादल फट", "প্রবল বৃষ্টি")),
]


def suggest_report_type(*texts: str) -> str | None:
    """Best-effort keyword suggestion of a ReportType name, or None when nothing matches."""
    haystack = " ".join(t for t in texts if t).lower()
    for report_type, needles in _KEYWORDS:
        if any(n.lower() in haystack for n in needles):
            return report_type
    return None


def require_explicit_type_for_severity(
    severity: str | None, explicit_report_type: str | None
) -> None:
    if severity in ("HIGH", "CRITICAL") and not explicit_report_type:
        raise VoiceReportInputError(
            f"severity {severity} needs an explicit report_type: a voice report's type is only "
            "auto-suggested and must not drive automatic escalation"
        )


def build_voice_report_description(
    transcript: VoiceTranscript, prefix: str = VOICE_REPORT_PREFIX
) -> str:
    """Reviewer-facing description: provenance tag, English text, then the original text."""
    translated = transcript.translated_text.strip()
    original = transcript.transcribed_text.strip()
    parts = [prefix, translated or original]
    if original and original != translated:
        parts.append(f"Original ({transcript.source_language}): {original}")
    text = re.sub(r"[ \t]+", " ", "\n\n".join(parts)).strip()
    return text[:MAX_DESCRIPTION_CHARS]
