"use client";

import { useRef, useState } from "react";
import { Mic, Volume2, Sparkles, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import { useVoiceReport, useTranscribeVoice, useSubmitTextReport } from "@/features/ai";
import { Banner, Button, Card, ErrorNotice, Field, StatusBadge } from "@/shared/ui";
import type { LocationPoint } from "@/shared/api";

interface Props {
  location: LocationPoint | null;
  onSuccess?: (reportId: string, description: string) => void;
}

const VOICE_LANGUAGES = [
  { code: "hi", label: "Hindi (हिन्दी) — Voice ASR" },
  { code: "bn", label: "Bengali (বাংলা) — Voice ASR" },
  { code: "en", label: "English — Voice ASR" },
];

const TEXT_LANGUAGES = [
  { code: "as", label: "Assamese (অসমীয়া)" },
  { code: "mni", label: "Manipuri (মৈতৈলোন্)" },
  { code: "bn", label: "Bengali (বাংলা)" },
  { code: "hi", label: "Hindi (हिन्दी)" },
];

export function VoiceReportSection({ location, onSuccess }: Props) {
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [lang, setLang] = useState("hi");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ original?: string; translated?: string } | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Text report state for Assamese/Manipuri
  const [textLang, setTextLang] = useState("as");
  const [typedText, setTypedText] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const voiceReport = useVoiceReport();
  const transcribeOnly = useTranscribeVoice();
  const textReport = useSubmitTextReport();

  const startRecording = async () => {
    try {
      setTranscript(null);
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setIsSimulated(false);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied or not available. Use 'Simulate Field Voice' button for demo!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const loadSimulatedSample = async () => {
    try {
      setTranscript(null);
      setIsSimulated(true);
      setLang("hi"); // Field sample audio is spoken in Hindi
      const res = await fetch("/samples/bhashini_sample_hi.wav");
      if (!res.ok) throw new Error("Could not load sample audio asset");
      const blob = await res.blob();
      setAudioBlob(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert("Failed to load sample audio: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleTranscribeOnly = async () => {
    if (!audioBlob) return;
    try {
      const res = await transcribeOnly.mutateAsync({
        file: audioBlob,
        source_language: lang,
        target_language: "en",
      });
      setTranscript({
        original: res.transcribed_text,
        translated: res.translated_text,
      });
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSubmitVoiceReport = async () => {
    if (!audioBlob) return;
    const lat = location?.latitude ?? 26.065;
    const lon = location?.longitude ?? 91.87;
    const acc = location?.accuracy_m ?? 50;

    try {
      const res = await voiceReport.mutateAsync({
        file: audioBlob,
        source_language: lang,
        latitude: lat,
        longitude: lon,
        accuracy_m: acc,
      });

      if (onSuccess) {
        onSuccess(res.report_id, res.description);
      }
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSubmitTextReport = async () => {
    if (!typedText.trim()) return;
    const lat = location?.latitude ?? 26.065;
    const lon = location?.longitude ?? 91.87;
    const acc = location?.accuracy_m ?? 50;

    try {
      const res = await textReport.mutateAsync({
        text: typedText,
        source_language: textLang,
        latitude: lat,
        longitude: lon,
        accuracy_m: acc,
      });

      if (onSuccess) {
        onSuccess(res.report_id, res.description);
      }
    } catch {
      // Error handled by mutation state
    }
  };

  const loadSampleAssamese = () => {
    setTextLang("as");
    setTypedText("এনএইচ-২৭ ত প্ৰচণ্ড বৰষুণৰ ফলত ডাঙৰ শিল খহি পৰিছে। দুয়োফালে গাড়ীৰ চলাচল সম্পূৰ্ণৰূপে বন্ধ হৈ পৰিছে।");
  };

  return (
    <Card
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Sparkles size={18} color="#6366f1" />
          <span>AI Multilingual Incident Reporting (Bhashini ULCA)</span>
        </div>
      }
    >
      <div className="stack" style={{ gap: "1rem" }}>
        {/* Mode Toggle: Voice vs Regional Text */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border-color, #e2e8f0)", paddingBottom: "0.8rem" }}>
          <Button
            size="small"
            variant={mode === "voice" ? "primary" : "default"}
            onClick={() => setMode("voice")}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Mic size={14} /> Voice Audio (Hindi / Bengali / English)
          </Button>
          <Button
            size="small"
            variant={mode === "text" ? "primary" : "default"}
            onClick={() => setMode("text")}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FileText size={14} /> Regional Text (Assamese / Manipuri)
          </Button>
        </div>

        {mode === "voice" ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              Speak in Hindi, Bengali, or English. Digital India Bhashini Division (MeitY) will transcribe your speech and automatically translate it into an authenticated English incident report.
            </p>

            <div className="row" style={{ gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <Field label="Spoken Language" htmlFor="voice-lang">
                <select
                  id="voice-lang"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  disabled={isRecording || isSimulated}
                >
                  {VOICE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="row" style={{ gap: "0.5rem" }}>
                {!isRecording ? (
                  <Button variant="primary" onClick={startRecording}>
                    🔴 Record Live Audio
                  </Button>
                ) : (
                  <Button variant="danger" onClick={stopRecording}>
                    ⏹️ Stop ({recordDuration}s)
                  </Button>
                )}

                <Button onClick={loadSimulatedSample} disabled={isRecording}>
                  🧪 Simulate Field Voice Sample
                </Button>
              </div>
            </div>

            {isRecording ? (
              <Banner tone="warn" title="Recording in progress…">
                <p className="small">Speak clearly about the location, road damage, or landslide obstruction. Tap Stop when finished.</p>
              </Banner>
            ) : null}

            {audioUrl ? (
              <div className="card" style={{ background: "rgba(99, 102, 241, 0.04)", border: "1px solid rgba(99, 102, 241, 0.15)", padding: "1rem", borderRadius: 8 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span className="small">
                    <strong>Audio Ready</strong> {isSimulated ? "(Field Sample Hindi WAV — Spoken in Hindi)" : "(Your Recording)"}
                  </span>
                  <span className="small muted">{audioBlob ? `${Math.round(audioBlob.size / 1024)} KB` : ""}</span>
                </div>
                <audio src={audioUrl} controls style={{ width: "100%", height: 36 }} />

                <div className="row" style={{ gap: "0.75rem", marginTop: "1rem" }}>
                  <Button
                    onClick={handleTranscribeOnly}
                    busy={transcribeOnly.isPending}
                    disabled={voiceReport.isPending}
                  >
                    Translate Preview
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmitVoiceReport}
                    busy={voiceReport.isPending}
                    disabled={transcribeOnly.isPending}
                  >
                    🚀 Submit Voice Report to Server
                  </Button>
                </div>
              </div>
            ) : null}

            {transcribeOnly.isError ? (
              <ErrorNotice error={transcribeOnly.error} subject="Voice transcription" />
            ) : null}

            {voiceReport.isError ? (
              <ErrorNotice error={voiceReport.error} subject="Voice report submission" />
            ) : null}

            {transcript ? (
              <div className="card" style={{ background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "1rem", borderRadius: 8 }}>
                <h4 style={{ margin: "0 0 0.5rem 0", color: "#10b981", fontSize: "0.95rem" }}>
                  ✨ Bhashini Translation Preview
                </h4>
                <div className="stack" style={{ gap: "0.5rem" }}>
                  <div>
                    <span className="small muted" style={{ display: "block" }}>Original Transcript ({lang.toUpperCase()}):</span>
                    <p style={{ margin: "2px 0 0 0", fontStyle: "italic" }}>"{transcript.original}"</p>
                  </div>
                  <div>
                    <span className="small muted" style={{ display: "block" }}>English Translation:</span>
                    <p style={{ margin: "2px 0 0 0", fontWeight: 600 }}>"{transcript.translated}"</p>
                  </div>
                </div>
              </div>
            ) : null}

            {voiceReport.isSuccess ? (
              <Banner tone="ok" title="Voice Report Successfully Submitted & Translated!">
                <div className="stack" style={{ gap: "0.4rem" }}>
                  <p className="small" style={{ margin: 0 }}>
                    Report ID: <code>{voiceReport.data.report_id}</code> &bull; Status: <StatusBadge kind="review" value={voiceReport.data.review_state} />
                  </p>
                  <p className="small" style={{ margin: 0 }}>
                    <strong>Detected Hazard:</strong> {voiceReport.data.report_type} ({voiceReport.data.severity})
                  </p>
                  <p className="small muted" style={{ margin: 0 }}>
                    "{voiceReport.data.description}"
                  </p>
                </div>
              </Banner>
            ) : null}
          </>
        ) : (
          /* Regional Text Translation Mode */
          <div className="stack" style={{ gap: "1rem" }}>
            <Banner tone="info" title="Bhashini Regional Text Translation">
              <p className="small" style={{ margin: 0 }}>
                Digital India Bhashini provides direct machine translation for Assamese (অসমীয়া), Manipuri (মৈতৈলোন্), and Bodo into authenticated English reports.
              </p>
            </Banner>

            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.5rem" }}>
              <Field label="Input Language" htmlFor="text-lang">
                <select
                  id="text-lang"
                  value={textLang}
                  onChange={(e) => setTextLang(e.target.value)}
                >
                  {TEXT_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Button size="small" onClick={loadSampleAssamese}>
                ✨ Load Sample Assamese Report
              </Button>
            </div>

            <div className="field">
              <label htmlFor="typed-report-text">Incident Description (in regional script):</label>
              <textarea
                id="typed-report-text"
                rows={3}
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type or paste report text in Assamese, Manipuri, or Bengali..."
              />
            </div>

            <div className="row" style={{ gap: "0.75rem" }}>
              <Button
                variant="primary"
                onClick={handleSubmitTextReport}
                busy={textReport.isPending}
                disabled={!typedText.trim()}
              >
                🚀 Translate & Submit Report (Bhashini AI)
              </Button>
            </div>

            {textReport.isError ? (
              <ErrorNotice error={textReport.error} subject="Regional text report" />
            ) : null}

            {textReport.isSuccess ? (
              <Banner tone="ok" title="Regional Report Translated & Submitted!">
                <div className="stack" style={{ gap: "0.4rem" }}>
                  <p className="small" style={{ margin: 0 }}>
                    Report ID: <code>{textReport.data.report_id}</code> &bull; Status: <StatusBadge kind="review" value={textReport.data.review_state} />
                  </p>
                  <p className="small" style={{ margin: 0 }}>
                    <strong>Detected Hazard:</strong> {textReport.data.report_type} ({textReport.data.severity})
                  </p>
                  <p className="small muted" style={{ margin: 0 }}>
                    "{textReport.data.description}"
                  </p>
                </div>
              </Banner>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
