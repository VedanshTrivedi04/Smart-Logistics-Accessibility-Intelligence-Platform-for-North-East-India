"use client";

import { useEffect, useRef, useState } from "react";
import { NER_BBOX } from "@/shared/lib/geo";

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

/**
 * Free-text place search via OpenStreetMap Nominatim (no API key, matches the rest of
 * this app's no-key map stack). Client-side calls respect Nominatim's usage policy by
 * debouncing to well under 1 request/second; the browser's own Referer header is what
 * Nominatim asks unattributed web apps to send (a custom User-Agent cannot be set from
 * browser JS). Results are restricted to the North-East India bounding box.
 */
async function searchPlaces(query: string, signal: AbortSignal): Promise<GeocodeResult[]> {
  const [minLon, minLat, maxLon, maxLat] = NER_BBOX;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("viewbox", `${minLon},${maxLat},${maxLon},${minLat}`);
  url.searchParams.set("bounded", "1");
  const res = await fetch(url.toString(), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .filter((r) => typeof r["lat"] === "string" && typeof r["lon"] === "string" && typeof r["display_name"] === "string")
    .map((r) => ({ label: r["display_name"] as string, lat: Number(r["lat"]), lon: Number(r["lon"]) }));
}

export function AddressSearch({ id, label, placeholder, onSelect }: { id: string; label: string; placeholder?: string; onSelect: (result: GeocodeResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      setFailed(false);
      searchPlaces(query.trim(), controller.signal)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="field" style={{ position: "relative" }}>
      <label htmlFor={id} style={{ fontWeight: 600, fontSize: "0.88rem", color: "#334155", marginBottom: "0.2rem" }}>
        {label}
      </label>
      <input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Search a place in North-East India…"}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        style={{
          width: "100%",
          padding: "0.7rem 0.9rem",
          borderRadius: "10px",
          background: "#ffffff",
          color: "#0f172a",
          border: "1.5px solid #cbd5e1",
          fontSize: "0.95rem",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
          outline: "none",
        }}
      />
      <span className="hint" role="status" style={{ fontSize: "0.78rem", color: "#64748b" }}>
        {loading ? "Searching places in North-East…" : failed ? "Search unavailable right now; try the hub dropdown above." : null}
      </span>
      {open && results.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="stack"
          style={{
            position: "absolute",
            zIndex: 30,
            top: "100%",
            left: 0,
            right: 0,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            margin: "0.3rem 0 0",
            padding: "0.35rem",
            listStyle: "none",
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 4px 6px -2px rgba(15, 23, 42, 0.05)",
          }}
        >
          {results.map((r, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button
                type="button"
                className="linkish"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  textDecoration: "none",
                  borderRadius: "6px",
                  color: "#0f172a",
                  fontSize: "0.85rem",
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(r);
                  setQuery(r.label);
                  setOpen(false);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
