"use client";

import { useEffect, useState } from "react";
import { useVerifyPhoto } from "@/features/ai";
import { Banner, Button, ErrorNotice, StatusBadge } from "@/shared/ui";
import type { VerifyPhotoResponse } from "@/shared/api";

interface Props {
  photoFile?: File | Blob | null;
  onVerification?: (res: VerifyPhotoResponse) => void;
  onSelectSample?: (file: File) => void;
}

export function PhotoHazardPreview({ photoFile, onVerification, onSelectSample }: Props) {
  const verifyPhoto = useVerifyPhoto();
  const [result, setResult] = useState<VerifyPhotoResponse | null>(null);

  useEffect(() => {
    if (!photoFile) {
      setResult(null);
      return;
    }
    verifyPhoto
      .mutateAsync(photoFile)
      .then((data) => {
        setResult(data);
        if (onVerification) onVerification(data);
      })
      .catch(() => {
        // Error state handled in UI
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoFile]);

  const loadSample = async (path: string, name: string) => {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Could not load ${path}`);
      const blob = await res.blob();
      const file = new File([blob], name, { type: "image/jpeg" });
      if (onSelectSample) onSelectSample(file);
    } catch (err) {
      alert("Error loading sample image: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="stack" style={{ gap: "0.75rem", marginTop: "0.5rem" }}>
      <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
        <Button size="small" onClick={() => loadSample("/samples/sample_landslide.jpg", "sample_landslide.jpg")}>
          📸 Test Sample Landslide Photo
        </Button>
        <Button size="small" onClick={() => loadSample("/samples/sample_clear_road.jpg", "sample_clear_road.jpg")}>
          🛣️ Test Sample Clear Road Photo
        </Button>
      </div>

      {verifyPhoto.isPending ? (
        <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
          <span className="small muted">🔍 Running YOLOv8m ONNX hazard verifier on photo…</span>
        </div>
      ) : null}

      {verifyPhoto.isError ? (
        <ErrorNotice error={verifyPhoto.error} subject="hazard photo verification" />
      ) : null}

      {result ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: 8,
            border: result.hazard_detected
              ? "1px solid rgba(239, 68, 68, 0.4)"
              : "1px solid rgba(34, 197, 94, 0.4)",
            background: result.hazard_detected
              ? "rgba(239, 68, 68, 0.08)"
              : "rgba(34, 197, 94, 0.08)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: 600 }}>
              AI Hazard Verification: {result.hazard_detected ? "⚠️ HAZARD DETECTED" : "✅ CLEAR ROAD"}
            </span>
            <StatusBadge kind="access" value={result.is_roadway_blocked ? "BLOCKED" : "OPEN"} />
          </div>

          <div className="grid cols-3" style={{ fontSize: "0.85rem", gap: "0.5rem" }}>
            <div>
              <span className="muted">Detected Class:</span>
              <p style={{ margin: "0.1rem 0", fontWeight: 600 }}>{result.hazard_class}</p>
            </div>
            <div>
              <span className="muted">Confidence:</span>
              <p style={{ margin: "0.1rem 0", fontWeight: 600 }}>{(result.confidence * 100).toFixed(1)}%</p>
            </div>
            <div>
              <span className="muted">Roadway Status:</span>
              <p style={{ margin: "0.1rem 0", fontWeight: 600, color: result.is_roadway_blocked ? "#ef4444" : "#22c55e" }}>
                {result.is_roadway_blocked ? "IMPASSABLE / BLOCKED" : "PASSABLE"}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
