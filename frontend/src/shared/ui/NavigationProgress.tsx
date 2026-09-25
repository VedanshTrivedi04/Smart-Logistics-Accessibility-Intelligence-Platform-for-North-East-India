"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Top-level responsive navigation progress bar.
 * Fires instantly when internal links are clicked to give 0ms feedback to the user,
 * and completes cleanly when the route transition resolves.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startProgress = () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setProgress(15);
    setVisible(true);

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 85;
        }
        // Decelerating progress curve
        const step = Math.max(1, (85 - prev) * 0.15);
        return Math.min(85, prev + step);
      });
    }, 120);
  };

  const completeProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);

    finishTimerRef.current = setTimeout(() => {
      setVisible(false);
      finishTimerRef.current = setTimeout(() => {
        setProgress(0);
      }, 250);
    }, 200);
  };

  // Route transition completed (pathname or searchParams changed)
  useEffect(() => {
    completeProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Intercept all internal navigation link clicks for instant 0ms feedback
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Skip external, target="_blank", anchors, or javascript actions
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        target.target === "_blank" ||
        target.download ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return;
      }

      // If clicking current exact page, don't trigger
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl) return;

      // Internal page transition started!
      startProgress();
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleDocumentClick, { capture: true });
      if (timerRef.current) clearInterval(timerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        zIndex: 999999,
        pointerEvents: "none",
        background: "transparent",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
    >
      {/* Animated gradient progress bar */}
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, #0284c7 0%, #38bdf8 50%, #6366f1 100%)",
          boxShadow: "0 0 10px rgba(56, 189, 248, 0.8), 0 0 4px rgba(2, 132, 199, 0.9)",
          borderRadius: "0 2px 2px 0",
          transition: progress === 100 ? "width 150ms ease-out" : "width 200ms cubic-bezier(0.1, 0.5, 0.1, 1)",
        }}
      />
      {/* Glowing tip */}
      {visible && progress < 100 && (
        <div
          style={{
            position: "absolute",
            top: "-1px",
            right: `${100 - progress}%`,
            width: "80px",
            height: "5px",
            background: "radial-gradient(ellipse at right, rgba(56, 189, 248, 1) 0%, rgba(56, 189, 248, 0) 70%)",
            opacity: 0.9,
          }}
        />
      )}
    </div>
  );
}
