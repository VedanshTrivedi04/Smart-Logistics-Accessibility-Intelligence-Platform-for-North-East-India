import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "@/features/session";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<p role="status" style={{ padding: "2rem" }}>Loading…</p>}>
      <LoginView />
    </Suspense>
  );
}
