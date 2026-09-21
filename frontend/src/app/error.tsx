"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ padding: "2rem", maxWidth: 560 }}>
      <h1>Something went wrong</h1>
      <p>The screen failed to display. Your saved reports on this device are not affected.</p>
      {error.digest ? <p className="small muted">Reference: <span className="mono">{error.digest}</span></p> : null}
      <button type="button" className="btn primary" onClick={reset}>Try again</button>
    </main>
  );
}
