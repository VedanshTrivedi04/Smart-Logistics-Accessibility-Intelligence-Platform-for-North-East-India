import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Providers } from "@/shared/auth";
import { NavigationProgress } from "@/shared/ui";

import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PRAVAHA · NER Logistics & Accessibility Platform", template: "%s · PRAVAHA" },
  description: "Evidence-aware road accessibility and essential-logistics coordination for North East India.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  applicationName: "PRAVAHA",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b5cad",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
