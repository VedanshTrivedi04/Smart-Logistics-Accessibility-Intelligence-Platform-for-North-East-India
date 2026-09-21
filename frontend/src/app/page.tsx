"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SURFACE_HOME, useSession } from "@/shared/auth";

export default function Home() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
    else if (session.status === "authenticated") router.replace(session.surface ? SURFACE_HOME[session.surface] : "/account");
  }, [session.status, session.surface, router]);
  return <p role="status" style={{ padding: "2rem" }}>Loading…</p>;
}
