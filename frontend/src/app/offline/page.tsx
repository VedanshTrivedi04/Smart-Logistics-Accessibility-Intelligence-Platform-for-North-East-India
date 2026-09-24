import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 560 }}>
      <h1>You are offline</h1>
      <p>This page could not be loaded because there is no connection and it was not saved on this device.</p>
      <p>
        Reports you already saved are still on this device. Open the <a href="/field/queue">send queue</a> or <a href="/field/report/new">start a new report</a>; both work without a connection once they have been opened online before.
      </p>
      <p className="muted small">Live maps, other people&apos;s reports and vehicle positions need a connection and are not available offline.</p>
    </main>
  );
}
