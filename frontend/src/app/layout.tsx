import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Providers } from "@/shared/auth";
import { NavigationProgress } from "@/shared/ui";

import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NER Logistics & Accessibility Platform", template: "%s · NER Logistics" },
  description: "Evidence-aware road accessibility and essential-logistics coordination for a North-East India pilot.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  applicationName: "NER Logistics",
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
