import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallback } from "@/features/session";

export const metadata: Metadata = { title: "Signing in" };

export default function CallbackPage() {
  return (
    <Suspense fallback={<p role="status" style={{ padding: "2rem" }}>Loading…</p>}>
      <AuthCallback />
    </Suspense>
  );
}
