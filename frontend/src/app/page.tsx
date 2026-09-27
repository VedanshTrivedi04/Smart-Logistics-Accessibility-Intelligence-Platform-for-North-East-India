"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SURFACE_HOME, useSession } from "@/shared/auth";
import { ReactLenis } from "lenis/react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import {
  ArrowRight,
  Shield,
  ShieldAlert,
  Navigation,
  Truck,
  MapPin,
  Activity,
  Layers,
  Radio,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Clock,
  Compass,
  Search,
  Menu,
  ChevronRight,
  Sliders,
  ZoomIn,
  ZoomOut,
  Eye,
  MessageSquare,
  Share2,
  FileText,
  CloudRain,
  Mountain,
  ChevronDown,
  X,
  RefreshCw,
} from "lucide-react";

export default function LandingPage() {
  const session = useSession();
  const isAuthenticated = session.status === "authenticated";
  const userSurface = session.surface ? SURFACE_HOME[session.surface] : "/gov";

  // Interactive showcase state
  const [activeTab, setActiveTab] = useState<"route" | "predict">("route");
  const [selectedWaypoint, setSelectedWaypoint] = useState<string>("guwahati");
  const [showFloodAlert, setShowFloodAlert] = useState(true);
  const [showLandslideAlert, setShowLandslideAlert] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);

  const { scrollY } = useScroll();
  
  // Instant-response spring filter to fix frame-tearing (zig-zag) without adding any lag
  const smoothY = useSpring(scrollY, { stiffness: 1000, damping: 100, mass: 0.05, restDelta: 0.001 });
  
  const mapX = useTransform(smoothY, [0, 800], ["2%", "-10vw"]); 
  const mapY = useTransform(smoothY, [0, 800], [0, 820]); 
  const mapScale = useTransform(smoothY, [0, 800], [1.15, 0.9]); 
  const routeProgress = useTransform(smoothY, [100, 700], [0, 1]);

  return (
    <ReactLenis root>
      <div
        style={{
          minHeight: "100vh",
          backgroundImage: "url('/bg-ner.jpeg')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
          backgroundAttachment: "fixed",
          backgroundSize: "cover",
        color: "#0f172a",
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
        overflowX: "hidden",
      }}
    >
      {/* ──────────────────────────────────────────────────────────
          Top Navigation Header (Hero Style)
          ────────────────────────────────────────────────────────── */}
      <header
        style={{
          maxWidth: "1320px",
          margin: "0 auto",
          padding: "1.1rem 1.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
        }}
      >
        {/* Brand Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.85rem", textDecoration: "none" }}>
          <Image 
            src="/logo-primary.png" 
            alt="Pravaha Logo" 
            width={44} 
            height={44} 
            style={{ objectFit: "contain" }} 
            unoptimized={true}
            priority
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  fontSize: "1.45rem",
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  color: "#0f172a",
                }}
              >
                PRAVAHA
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "0.15rem 0.55rem",
                  borderRadius: "9999px",
                  background: "#eff6ff",
                  color: "#0284c7",
                  fontWeight: 700,
                  border: "1px solid #bfdbfe",
                  letterSpacing: "0.03em",
                }}
              >
                NER SPATIAL AI
              </span>
            </div>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
          }}
          className="desktop-nav"
        >
          {["Home", "About", "Solutions", "Features", "How It Works", "Insights", "Blogs", "Contact"].map((item) => (
            <Link
              key={item}
              href={item === "Home" ? "/" : `#${item.toLowerCase().replace(/\s+/g, '-')}`}
              style={{
                fontSize: "0.88rem",
                fontWeight: item === "Home" ? 600 : 500,
                color: item === "Home" ? "#0f172a" : "#475569",
                textDecoration: "none",
                transition: "color 0.15s ease",
              }}
            >
              {item}
            </Link>
          ))}
        </nav>

        {/* Right Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          {isAuthenticated ? (
            <Link
              href={userSurface}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "#0f172a",
                color: "#ffffff",
                padding: "0.55rem 1.35rem",
                borderRadius: "9999px",
                fontSize: "0.88rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(15, 23, 42, 0.2)",
                transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10b981",
                  display: "inline-block",
                }}
              />
              {session.principal?.display_name || "Active Portal"} →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  color: "#0f172a",
                  textDecoration: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "9999px",
                  transition: "background 0.15s ease",
                }}
              >
                Log in
              </Link>
              <Link
                href="/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  background: "#0f172a",
                  color: "#ffffff",
                  padding: "0.6rem 1.45rem",
                  borderRadius: "9999px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.18)",
                  transition: "all 0.15s ease",
                }}
              >
                Sign Now →
              </Link>
            </>
          )}
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────
          HERO SECTION (Matching Frame 1 from user video)
          ────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: "1320px",
          margin: "0 auto",
          padding: "3.5rem 1.75rem 4rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1.25fr)",
            gap: "2.5rem",
            alignItems: "center",
          }}
          className="hero-grid"
        >
          {/* Left Hero Content */}
          <div>
            {/* Pill Tag */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.3rem 0.9rem",
                borderRadius: "9999px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "#ea580c",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                marginBottom: "1.4rem",
              }}
            >
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: "#ea580c",
                  display: "inline-block",
                }}
              />
              PRAVAHA · Autonomous NER Network
            </div>

            {/* Main Headline */}
            <h1
              style={{
                fontSize: "clamp(2.6rem, 5.5vw, 4.4rem)",
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                color: "#0f172a",
                margin: "0 0 1.35rem",
              }}
            >
              Smarter Logistics.
              <br />
              Connected North East.
            </h1>

            {/* Sub-headline */}
            <p
              style={{
                fontSize: "1.18rem",
                lineHeight: 1.6,
                color: "#475569",
                maxWidth: "520px",
                margin: "0 0 2.2rem",
              }}
            >
              AI-powered logistics intelligence for a more accessible and connected North Eastern Region.
            </p>

            {/* Action CTA Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "3rem" }}>
              <a
                href="#portals"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  background: "#0f172a",
                  color: "#ffffff",
                  padding: "0.85rem 2.2rem",
                  borderRadius: "9999px",
                  fontSize: "1.02rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 10px 25px -4px rgba(15, 23, 42, 0.25)",
                  transition: "all 0.15s ease",
                }}
              >
                Explore Portals →
              </a>

              <a
                href="#route-intelligence"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "#ffffff",
                  color: "#0f172a",
                  padding: "0.85rem 1.9rem",
                  borderRadius: "9999px",
                  fontSize: "1.02rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  border: "1.5px solid #e2e8f0",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
                  transition: "all 0.15s ease",
                }}
              >
                Learn More →
              </a>
            </div>

            {/* Slider Dots Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
              <span
                style={{
                  width: "28px",
                  height: "4px",
                  borderRadius: "4px",
                  background: "#0f172a",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: "6px",
                  height: "4px",
                  borderRadius: "4px",
                  background: "#cbd5e1",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  width: "6px",
                  height: "4px",
                  borderRadius: "4px",
                  background: "#cbd5e1",
                  display: "inline-block",
                }}
              />
            </div>
          </div>

          {/* Right Hero Content (3D Map) */}
          <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <motion.div
              style={{
                width: "110%",
                height: "auto",
                x: mapX,
                y: mapY,
                scale: mapScale,
                filter: "drop-shadow(0 25px 35px rgba(0, 0, 0, 0.25))",
                zIndex: 50,
                transformOrigin: "center center",
                position: "relative",
              }}
            >
              <Image
                src="/main map up.png"
                alt="NER Autonomous Network 3D Map"
                width={900}
                height={700}
                style={{ width: "100%", height: "auto", objectFit: "contain" }}
                priority
              />
              
              {/* Overlay Routes & Locations */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {/* SVG Route Line */}
                <svg width="100%" height="100%" viewBox="0 0 900 700" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
                  
                  {/* ====== ROUTE 1: RED (Guwahati to Pasighat, bypassing Tezpur) ====== */}
                  <motion.path 
                    d="M 280 430 C 320 440, 340 445, 360 440 S 420 430, 450 420 S 500 380, 540 360 S 590 310, 630 290 S 660 250, 680 240 S 700 200, 720 180" 
                    fill="none" 
                    stroke="#ef4444" 
                    strokeWidth="12" 
                    strokeLinecap="round" 
                    style={{ filter: "blur(8px)", opacity: 0.6 }} 
                  />
                  <motion.path 
                    d="M 280 430 C 320 440, 340 445, 360 440 S 420 430, 450 420 S 500 380, 540 360 S 590 310, 630 290 S 660 250, 680 240 S 700 200, 720 180" 
                    fill="none" 
                    stroke="url(#routeGradientRed)" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                    style={{ filter: "drop-shadow(0 0 10px #f87171)" }} 
                  />
                  {/* Red Waypoints */}
                  <g fill="#ffffff" stroke="#ef4444" strokeWidth="3">
                    <circle cx="360" cy="440" r="5" />
                    <circle cx="450" cy="420" r="5" />
                    <circle cx="540" cy="360" r="5" />
                    <circle cx="630" cy="290" r="5" />
                    <circle cx="680" cy="240" r="5" />
                  </g>

                  {/* ====== ROUTE 2: GREEN (Guwahati to Pasighat via Tezpur) ====== */}
                  <motion.path 
                    d="M 280 430 C 310 420, 320 405, 340 400 S 390 380, 410 370 S 450 330, 480 320 S 520 310, 560 300 S 610 260, 640 240 S 670 210, 690 200 S 710 190, 720 180" 
                    fill="none" 
                    stroke="#10b981" 
                    strokeWidth="12" 
                    strokeLinecap="round" 
                    style={{ pathLength: routeProgress, filter: "blur(8px)", opacity: 0.6 }} 
                  />
                  <motion.path 
                    d="M 280 430 C 310 420, 320 405, 340 400 S 390 380, 410 370 S 450 330, 480 320 S 520 310, 560 300 S 610 260, 640 240 S 670 210, 690 200 S 710 190, 720 180" 
                    fill="none" 
                    stroke="url(#routeGradientGreen)" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                    style={{ pathLength: routeProgress, filter: "drop-shadow(0 0 10px #4ade80)" }} 
                  />
                  {/* Green Waypoints */}
                  <g fill="#ffffff" stroke="#10b981" strokeWidth="3">
                    <circle cx="340" cy="400" r="5" />
                    <circle cx="410" cy="370" r="5" />
                    <circle cx="480" cy="320" r="5" />
                    <circle cx="560" cy="300" r="5" />
                    <circle cx="640" cy="240" r="5" />
                    <circle cx="690" cy="200" r="5" />
                  </g>

                  <defs>
                    <linearGradient id="routeGradientGreen" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="50%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                    <linearGradient id="routeGradientRed" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f87171" />
                      <stop offset="50%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#f87171" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Start Location - Guwahati */}
                <div style={{ position: "absolute", left: "30%", top: "60%", transform: "translate(-50%, -100%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                  <div style={{ background: "#ffffff", padding: "4px 10px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 700, color: "#0f172a", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", marginBottom: "4px" }}>Guwahati</div>
                  <div style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.4))" }}>
                    <svg width="26" height="34" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0C5.373 0 0 5.373 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.373 18.627 0 12 0Z" fill="#4f46e5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"/>
                      <circle cx="12" cy="12" r="5" fill="white"/>
                    </svg>
                  </div>
                </div>

                {/* Middle Location - Tezpur */}
                <div style={{ position: "absolute", left: "55%", top: "45%", transform: "translate(-50%, -100%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                  <div style={{ background: "#ffffff", padding: "4px 10px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 700, color: "#0f172a", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", marginBottom: "4px" }}>Tezpur</div>
                  <div style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.4))" }}>
                    <svg width="26" height="34" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0C5.373 0 0 5.373 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.373 18.627 0 12 0Z" fill="#4f46e5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"/>
                      <circle cx="12" cy="12" r="5" fill="white"/>
                    </svg>
                  </div>
                </div>

                {/* Landslide Badge on Red Route */}
                <div style={{ position: "absolute", left: "60%", top: "51.4%", transform: "translate(-50%, -100%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1], boxShadow: ["0 2px 8px rgba(239,68,68,0.3)", "0 0 15px rgba(239,68,68,0.8)", "0 2px 8px rgba(239,68,68,0.3)"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    style={{ 
                      background: "rgba(15, 23, 42, 0.85)", 
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      padding: "4px 8px 4px 4px", 
                      borderRadius: "16px", 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "4px" 
                    }}
                  >
                    <div style={{ background: "#ef4444", borderRadius: "50%", padding: "3px", color: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 8px rgba(239,68,68,0.6)" }}>
                      <AlertTriangle size={10} strokeWidth={3} />
                    </div>
                    <span style={{ fontSize: "0.55rem", fontWeight: 800, color: "#fca5a5", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Landslide
                    </span>
                  </motion.div>
                </div>

                {/* End Location - Pasighat */}
                <div style={{ position: "absolute", left: "80%", top: "25%", transform: "translate(-50%, -100%)", display: "flex", flexDirection: "column", alignItems: "center", zIndex: 10 }}>
                  <div style={{ background: "#ffffff", padding: "4px 10px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 700, color: "#0f172a", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", marginBottom: "4px" }}>Pasighat</div>
                  <div style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.4))" }}>
                    <svg width="26" height="34" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 0C5.373 0 0 5.373 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.373 18.627 0 12 0Z" fill="#4f46e5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"/>
                      <circle cx="12" cy="12" r="5" fill="white"/>
                    </svg>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 1: AI-Powered Route Intelligence (Frame 2 & 3)
          ────────────────────────────────────────────────────────── */}
      <section
        id="route-intelligence"
        style={{
          maxWidth: "1320px",
          margin: "3rem auto 5rem",
          padding: "0 1.75rem",
        }}
      >
        {/* Section Header with Right Sparkline Cards */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "2rem",
            marginBottom: "2rem",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#0284c7",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "0.45rem",
              }}
            >
              DISPATCH INTELLIGENCE &amp; ROUTE SOLVER
            </div>
            <h2
              style={{
                fontSize: "clamp(2rem, 3.8vw, 2.9rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#0f172a",
                margin: "0 0 0.65rem",
              }}
            >
              AI-Powered Route Intelligence
            </h2>
            <p
              style={{
                fontSize: "1.05rem",
                color: "#64748b",
                maxWidth: "600px",
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              AI-powered logistics intelligence for a more accessible, weather-resilient, and disruption-proof supply network across mountain terrain.
            </p>
          </div>

          {/* Top Right Metric Sparklines (As in Screenshot 2) */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {/* Sparkline Card 1: Delay reduction */}
            <div
              className="glass-card"
              style={{
                padding: "1rem 1.25rem",
                borderRadius: "16px",
                minWidth: "180px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>Delay reduction</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.2rem 0" }}>
                <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0284c7" }}>18%</span>
                <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 700 }}>↓ faster</span>
              </div>
              {/* Dynamic SVG Sparkline */}
              <svg width="140" height="34" viewBox="0 0 140 34" fill="none">
                <path
                  d="M 0 26 Q 25 28 50 18 T 100 12 T 140 4"
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 0 26 Q 25 28 50 18 T 100 12 T 140 4 L 140 34 L 0 34 Z"
                  fill="url(#sparklineGradBlue)"
                  opacity="0.25"
                />
                <defs>
                  <linearGradient id="sparklineGradBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284c7" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Sparkline Card 2: Reliability */}
            <div
              className="glass-card"
              style={{
                padding: "1rem 1.25rem",
                borderRadius: "16px",
                minWidth: "180px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>Predictability</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", margin: "0.2rem 0" }}>
                <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#059669" }}>96%</span>
                <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 700 }}>↑ stable</span>
              </div>
              {/* Dynamic Wave Sparkline */}
              <svg width="140" height="34" viewBox="0 0 140 34" fill="none">
                <path
                  d="M 0 22 C 20 28, 40 10, 65 14 C 90 18, 115 6, 140 8"
                  stroke="#059669"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 0 22 C 20 28, 40 10, 65 14 C 90 18, 115 6, 140 8 L 140 34 L 0 34 Z"
                  fill="url(#sparklineGradGreen)"
                  opacity="0.25"
                />
                <defs>
                  <linearGradient id="sparklineGradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────
            TABLET HARDWARE SHOWCASE CONTAINER (Matches Frame 2 & 3)
            ────────────────────────────────────────────────────────── */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: "32px",
            padding: "10px",
            boxShadow:
              "0 30px 70px -15px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1) inset",
          }}
        >
          {/* Inner Tablet Display Screen */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              overflow: "hidden",
              display: "flex",
              minHeight: "560px",
              position: "relative",
            }}
          >
            {/* Tablet Mini Sidebar (Matches Screenshots) */}
            <div
              style={{
                width: "68px",
                background: "#ffffff",
                borderRight: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "1rem 0",
                gap: "1.25rem",
                flexShrink: 0,
                zIndex: 20,
              }}
            >
              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#475569",
                  padding: "0.4rem",
                }}
              >
                <Menu size={20} />
              </button>

              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  background: activeTab === "route" ? "#eff6ff" : "transparent",
                  color: activeTab === "route" ? "#0284c7" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => setActiveTab("route")}
                title="Route Intelligence"
              >
                <Navigation size={20} />
              </div>

              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  background: activeTab === "predict" ? "#fff7ed" : "transparent",
                  color: activeTab === "predict" ? "#ea580c" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => setActiveTab("predict")}
                title="Predictive Threat Radar"
              >
                <ShieldAlert size={20} />
              </div>

              <Link
                href="/logistics"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                }}
                title="Fleet Command"
              >
                <Truck size={20} />
              </Link>

              <Link
                href="/gov/reports"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                }}
                title="Ground Reports"
              >
                <FileText size={20} />
              </Link>

              <div style={{ marginTop: "auto" }}>
                <Link
                  href="/status"
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    color: "#64748b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                  }}
                  title="System Status"
                >
                  <Activity size={20} />
                </Link>
              </div>
            </div>

            {/* Tablet Main Viewport */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: "560px" }}>
              {/* Tablet Top Controls Bar */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "14px",
                  right: "14px",
                  zIndex: 25,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                {/* Search Bar inside Tablet */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.92)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "9999px",
                    padding: "0.45rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
                    border: "1px solid #e2e8f0",
                    width: "min(100%, 360px)",
                  }}
                >
                  <Search size={16} color="#64748b" />
                  <input
                    type="text"
                    placeholder="Search NH corridors, nodes, assets..."
                    style={{
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontSize: "0.85rem",
                      color: "#0f172a",
                      width: "100%",
                      padding: 0,
                      minHeight: "unset",
                    }}
                    readOnly
                    value="NH-27 Guwahati ↔ Dibrugarh Corridor"
                  />
                </div>

                {/* Mode Selector Tabs */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.92)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "9999px",
                    padding: "0.25rem",
                    display: "flex",
                    gap: "0.25rem",
                    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08)",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <button
                    onClick={() => setActiveTab("route")}
                    style={{
                      border: "none",
                      background: activeTab === "route" ? "#0f172a" : "transparent",
                      color: activeTab === "route" ? "#ffffff" : "#475569",
                      padding: "0.4rem 1rem",
                      borderRadius: "9999px",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Route Solver
                  </button>
                  <button
                    onClick={() => setActiveTab("predict")}
                    style={{
                      border: "none",
                      background: activeTab === "predict" ? "#ea580c" : "transparent",
                      color: activeTab === "predict" ? "#ffffff" : "#475569",
                      padding: "0.4rem 1rem",
                      borderRadius: "9999px",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Hazard Threat Radar ⚠️
                  </button>
                </div>
              </div>

              {/* Realistic Topographic Terrain Canvas */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: "center center",
                  transition: "transform 0.3s ease",
                }}
              >
                <Image
                  src="/ner-topo-tablet.jpg"
                  alt="NER Topographic Terrain Map"
                  fill
                  unoptimized
                  style={{
                    objectFit: "cover",
                    objectPosition: "center 35%",
                  }}
                />

                {/* SVG Route Ribbon Overlay for Tablet */}
                <svg
                  viewBox="0 0 1000 600"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                >
                  <defs>
                    <linearGradient id="tabletRouteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="40%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>

                  {/* Multi-node Highway Corridor Route */}
                  <path
                    d="M 120 460 L 260 410 Q 380 430 460 380 T 630 310 T 780 230"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="10"
                    strokeOpacity="0.3"
                  />
                  <path
                    d="M 120 460 L 260 410 Q 380 430 460 380 T 630 310 T 780 230"
                    fill="none"
                    stroke="url(#tabletRouteGrad)"
                    strokeWidth="5"
                    strokeDasharray="9 7"
                    style={{ animation: "dashFlow 2.5s linear infinite" }}
                  />

                  {/* Alternative Mountain Bypass Route */}
                  <path
                    d="M 460 380 Q 510 430 580 440 T 690 380"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeDasharray="6 5"
                    strokeOpacity="0.8"
                  />
                </svg>

                {/* Interactive Waypoints */}
                <div
                  style={{
                    position: "absolute",
                    left: "46%",
                    top: "63%",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedWaypoint("guwahati")}
                >
                  <div style={{ position: "relative" }}>
                    <div className="radar-ring" />
                    <div
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: "#0284c7",
                        border: "3px solid #ffffff",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: "26%",
                    top: "68%",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedWaypoint("siliguri")}
                >
                  <div style={{ position: "relative" }}>
                    <div
                      style={{
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: "#f59e0b",
                        border: "3px solid #ffffff",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: "78%",
                    top: "38%",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedWaypoint("dibrugarh")}
                >
                  <div style={{ position: "relative" }}>
                    <div className="radar-ring" />
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: "#38bdf8",
                        border: "3px solid #ffffff",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* ── MODE 1: ROUTE INTELLIGENCE OVERLAYS ── */}
              {activeTab === "route" && (
                <>
                  {/* Floating AI Optimized Route Card (Matches Screenshot 2) */}
                  <div
                    className="glass-card"
                    style={{
                      position: "absolute",
                      top: "76px",
                      left: "24px",
                      padding: "1rem 1.35rem",
                      borderRadius: "18px",
                      zIndex: 30,
                      maxWidth: "340px",
                      boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        color: "#0284c7",
                        textTransform: "uppercase",
                        marginBottom: "0.45rem",
                      }}
                    >
                      <Sparkles size={14} /> AI OPTIMIZED ROUTE
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.5rem" }}>
                      <div>
                        <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>18%</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Faster transit</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#059669" }}>12%</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Lower Cost</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#d97706" }}>12%</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Weather Risk</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "1.35rem", fontWeight: 900, color: "#7c3aed" }}>96%</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Accessibility</div>
                      </div>
                    </div>
                  </div>

                  {/* Waypoint Tooltip Popover */}
                  <div
                    className="glass-card"
                    style={{
                      position: "absolute",
                      bottom: "30px",
                      left: "24px",
                      padding: "0.85rem 1.2rem",
                      borderRadius: "16px",
                      zIndex: 30,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      maxWidth: "420px",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: "#eff6ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#0284c7",
                        flexShrink: 0,
                      }}
                    >
                      <MapPin size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>
                        NH-27 Brahmaputra Lifeline Corridor
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Guwahati ↔ Nagaon · Status: PASSABLE · Avg Convoy Speed: 52 km/h
                      </div>
                    </div>
                    <Link
                      href="/public"
                      style={{
                        background: "#0f172a",
                        color: "#fff",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "8px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                        marginLeft: "auto",
                      }}
                    >
                      Inspect →
                    </Link>
                  </div>
                </>
              )}

              {/* ── MODE 2: PREDICTIVE THREAT RADAR (Matches Frame 4) ── */}
              {activeTab === "predict" && (
                <>
                  {/* Floating Hazard 1: Flood Risk Detected (Red Banner) */}
                  {showFloodAlert && (
                    <div
                      className="glass-card"
                      style={{
                        position: "absolute",
                        top: "84px",
                        left: "30%",
                        padding: "1rem 1.25rem",
                        borderRadius: "18px",
                        zIndex: 35,
                        maxWidth: "340px",
                        border: "1px solid #fecaca",
                        boxShadow: "0 15px 35px rgba(220, 38, 38, 0.12)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "#dc2626", fontWeight: 800, fontSize: "0.92rem" }}>
                          <AlertTriangle size={18} />
                          Flood Risk Detected
                        </div>
                        <button
                          onClick={() => setShowFloodAlert(false)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p style={{ fontSize: "0.78rem", color: "#475569", margin: "0 0 0.65rem", lineHeight: 1.45 }}>
                        Brahmaputra flash flood zone (NH-715) · Projected water surge +1.4m in 6h. Diverting heavy freight to elevated bypass.
                      </p>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Link
                          href="/gov/incidents"
                          style={{
                            background: "#dc2626",
                            color: "#ffffff",
                            padding: "0.35rem 0.75rem",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          Trigger Detour
                        </Link>
                        <span style={{ fontSize: "0.72rem", color: "#64748b", alignSelf: "center" }}>
                          Automated reroute active
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Floating Hazard 2: Landslide Probability: 84% (Orange Banner) */}
                  {showLandslideAlert && (
                    <div
                      className="glass-card"
                      style={{
                        position: "absolute",
                        top: "220px",
                        right: "12%",
                        padding: "1rem 1.25rem",
                        borderRadius: "18px",
                        zIndex: 35,
                        maxWidth: "320px",
                        border: "1px solid #fed7aa",
                        boxShadow: "0 15px 35px rgba(234, 88, 12, 0.12)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: "#ea580c", fontWeight: 800, fontSize: "0.92rem" }}>
                          <ShieldAlert size={18} />
                          Landslide Probability: 84%
                        </div>
                        <button
                          onClick={() => setShowLandslideAlert(false)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <p style={{ fontSize: "0.78rem", color: "#475569", margin: "0 0 0.65rem", lineHeight: 1.45 }}>
                        NH-6 Barapani slope section · Extreme monsoon saturation. 3 ground inspection teams notified.
                      </p>
                      <Link
                        href="/field/report/new"
                        style={{
                          display: "inline-block",
                          background: "#ea580c",
                          color: "#ffffff",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Inspect Ground Report →
                      </Link>
                    </div>
                  )}
                </>
              )}

              {/* Tablet Zoom and Map Controls (Right Side) */}
              <div
                style={{
                  position: "absolute",
                  bottom: "24px",
                  right: "24px",
                  zIndex: 25,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                <button
                  onClick={() => setZoomLevel((prev) => Math.min(prev + 0.2, 1.8))}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#0f172a",
                  }}
                  title="Zoom In"
                >
                  <ZoomIn size={18} />
                </button>
                <button
                  onClick={() => setZoomLevel((prev) => Math.max(prev - 0.2, 0.9))}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#0f172a",
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut size={18} />
                </button>
                <button
                  onClick={() => setZoomLevel(1)}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#0f172a",
                  }}
                  title="Reset View"
                >
                  <Compass size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 3: FOUR DEDICATED OPERATIONAL PORTALS
          ────────────────────────────────────────────────────────── */}
      <section
        id="portals"
        style={{
          maxWidth: "1320px",
          margin: "0 auto 5rem",
          padding: "0 1.75rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
          <h2
            style={{
              fontSize: "clamp(2rem, 3.8vw, 2.8rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#0f172a",
              margin: "0 0 0.65rem",
            }}
          >
            Four Integrated Operational Portals
          </h2>
          <p
            style={{
              fontSize: "1.02rem",
              color: "#64748b",
              maxWidth: "640px",
              margin: "0 auto",
            }}
          >
            Engineered for regional governments, fleet dispatchers, mountain patrols, and citizens with role-based access.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {/* 1. Government Command */}
          <div
            className="glass-card"
            style={{
              padding: "1.85rem",
              borderRadius: "22px",
              border: "1px solid #bae6fd",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 10px 25px -4px rgba(2, 132, 199, 0.08)",
            }}
          >
            <div>
              <div style={{ fontSize: "2.4rem", marginBottom: "0.85rem" }}>🏛️</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.45rem", color: "#0284c7" }}>
                Government Command
              </h3>
              <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Regional MDoNER &amp; State Authority dashboard. Road closures, incident verification, strategic fuel protection, and network impact analytics.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.65 }}>
                <li>MDoNER regional corridor monitoring</li>
                <li>District hazard verification workflow</li>
                <li>Strategic fuel &amp; medical route protection</li>
              </ul>
            </div>
            <Link
              href="/gov"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                background: "#f0f9ff",
                color: "#0284c7",
                border: "1.5px solid #bae6fd",
                padding: "0.75rem 1.2rem",
                borderRadius: "12px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Enter Gov Command →
            </Link>
          </div>

          {/* 2. Logistics & Fleet Command */}
          <div
            className="glass-card"
            style={{
              padding: "1.85rem",
              borderRadius: "22px",
              border: "1px solid #a7f3d0",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 10px 25px -4px rgba(16, 185, 129, 0.08)",
            }}
          >
            <div>
              <div style={{ fontSize: "2.4rem", marginBottom: "0.85rem" }}>🛰️</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.45rem", color: "#059669" }}>
                Logistics Fleet Command
              </h3>
              <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Real-time vehicle GPS telemetry, cold-chain medical consignment tracking, convoy dispatch, autonomous rerouting, and driver cockpit.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.65 }}>
                <li>Live vehicle telemetry &amp; breadcrumbs</li>
                <li>Tier-1 life-saving consignment priority</li>
                <li>Driver cockpit with 1-touch hazard reporting</li>
              </ul>
            </div>
            <Link
              href="/logistics"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                background: "#ecfdf5",
                color: "#059669",
                border: "1.5px solid #a7f3d0",
                padding: "0.75rem 1.2rem",
                borderRadius: "12px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Enter Fleet Portal →
            </Link>
          </div>

          {/* 3. Field Operations PWA */}
          <div
            className="glass-card"
            style={{
              padding: "1.85rem",
              borderRadius: "22px",
              border: "1px solid #fed7aa",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 10px 25px -4px rgba(234, 88, 12, 0.08)",
            }}
          >
            <div>
              <div style={{ fontSize: "2.4rem", marginBottom: "0.85rem" }}>📱</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.45rem", color: "#ea580c" }}>
                Field Operations PWA
              </h3>
              <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Offline-first mobile client for mountain patrols and road inspectors. Capture GPS photos, landslides, and road subsidence in zero-signal river valleys.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.65 }}>
                <li>Zero-connectivity IndexedDB persistence</li>
                <li>Multi-step photo &amp; GPS hazard wizard</li>
                <li>Built-in offline/online network simulator</li>
              </ul>
            </div>
            <Link
              href="/field"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                background: "#fff7ed",
                color: "#ea580c",
                border: "1.5px solid #fed7aa",
                padding: "0.75rem 1.2rem",
                borderRadius: "12px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Enter Field App →
            </Link>
          </div>

          {/* 4. Public Citizen Checker */}
          <div
            className="glass-card"
            style={{
              padding: "1.85rem",
              borderRadius: "22px",
              border: "1px solid #e9d5ff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 10px 25px -4px rgba(124, 58, 237, 0.08)",
            }}
          >
            <div>
              <div style={{ fontSize: "2.4rem", marginBottom: "0.85rem" }}>🗺️</div>
              <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.45rem", color: "#7c3aed" }}>
                Citizen Route Checker
              </h3>
              <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.55, marginBottom: "1.25rem" }}>
                Public highway safety checker for residents and travelers. Live passability status, mountain elevation profiles, and estimated transit times across NER routes.
              </p>
              <ul style={{ fontSize: "0.82rem", color: "#334155", paddingLeft: "1.1rem", margin: "0 0 1.5rem", lineHeight: 1.65 }}>
                <li>No login required for citizens</li>
                <li>Interactive mountain elevation profile</li>
                <li>Real-time hill driving safety guidance</li>
              </ul>
            </div>
            <Link
              href="/public"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                background: "#faf5ff",
                color: "#7c3aed",
                border: "1.5px solid #e9d5ff",
                padding: "0.75rem 1.2rem",
                borderRadius: "12px",
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.92rem",
                transition: "all 0.15s ease",
              }}
            >
              Open Route Checker →
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 4: 8 NORTH EAST STATES STRIP & TELEMETRY
          ────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: "1320px",
          margin: "0 auto 5rem",
          padding: "0 1.75rem",
        }}
      >
        <div
          className="glass-card"
          style={{
            borderRadius: "24px",
            padding: "2rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: "0.8rem",
              color: "#64748b",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "1.25rem",
            }}
          >
            Operating Across All 8 North Eastern States
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "2rem",
            }}
          >
            {[
              { name: "Assam", hub: "Guwahati Hub", pass: "98%" },
              { name: "Meghalaya", hub: "Shillong Plateau", pass: "94%" },
              { name: "Arunachal Pradesh", hub: "Itanagar Gateway", pass: "89%" },
              { name: "Nagaland", hub: "Kohima Life-line", pass: "92%" },
              { name: "Manipur", hub: "Imphal Depot", pass: "88%" },
              { name: "Mizoram", hub: "Aizawl Ridge", pass: "90%" },
              { name: "Tripura", hub: "Agartala Transit", pass: "97%" },
              { name: "Sikkim", hub: "Gangtok Corridor", pass: "91%" },
            ].map((st) => (
              <div
                key={st.name}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  padding: "0.5rem 1rem",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.02)",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>{st.name}</span>
                <span
                  style={{
                    fontSize: "0.74rem",
                    padding: "0.15rem 0.45rem",
                    borderRadius: "6px",
                    background: "#f0fdf4",
                    color: "#15803d",
                    fontWeight: 700,
                  }}
                >
                  {st.pass}
                </span>
              </div>
            ))}
          </div>

          {/* Telemetry Counter Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1.25rem",
              borderTop: "1px solid #e2e8f0",
              paddingTop: "1.75rem",
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#0284c7" }}>19 Nodes</div>
              <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>Active Mountain Spine</div>
            </div>
            <div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#059669" }}>3 Bridges</div>
              <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>Real-time Scour Sensors</div>
            </div>
            <div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#d97706" }}>Sub-Second</div>
              <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>PostGIS Dijkstra Solver</div>
            </div>
            <div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#7c3aed" }}>100% Offline</div>
              <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>IndexedDB PWA Sync</div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SECTION 2: PREDICT BEFORE IT HAPPENS (Frame 4 Feature Banner)
          ────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: "1320px",
          margin: "0 auto 5rem",
          padding: "0 1.75rem",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#ea580c",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "0.45rem",
            }}
          >
            EARLY WARNING SYSTEM &amp; HAZARD RADAR
          </div>
          <h2
            style={{
              fontSize: "clamp(2rem, 3.8vw, 2.9rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#0f172a",
              margin: "0 0 0.65rem",
            }}
          >
            Predict Before It Happens
          </h2>
          <p
            style={{
              fontSize: "1.05rem",
              color: "#64748b",
              maxWidth: "680px",
              margin: "0 auto",
              lineHeight: 1.55,
            }}
          >
            AI-powered vulnerability forecasting for landslides, flash floods, and bridge washouts before supply chains stall across North East India.
          </p>
        </div>

        {/* 3 Predictive Intelligence Pillars */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1.5rem",
          }}
        >
          <div
            className="glass-card"
            style={{
              padding: "1.75rem",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              transition: "transform 0.2s ease",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "#eff6ff",
                color: "#0284c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.25rem",
              }}
            >
              <CloudRain size={24} />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem" }}>
              Brahmaputra Flood Hydrology
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#64748b", lineHeight: 1.6, margin: 0 }}>
              Continuously correlates CWC river gauges and catchment precipitation to project bridge pier clearance and roadway submersion up to 48 hours in advance.
            </p>
          </div>

          <div
            className="glass-card"
            style={{
              padding: "1.75rem",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              transition: "transform 0.2s ease",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "#fff7ed",
                color: "#ea580c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.25rem",
              }}
            >
              <Mountain size={24} />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem" }}>
              Slope Saturation &amp; Landslides
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#64748b", lineHeight: 1.6, margin: 0 }}>
              Machine learning models trained on geological shear strength and IMD rain thresholds flag high-risk slopes along NH-6, NH-29, and NH-102 before earth slips occur.
            </p>
          </div>

          <div
            className="glass-card"
            style={{
              padding: "1.75rem",
              borderRadius: "20px",
              border: "1px solid #e2e8f0",
              transition: "transform 0.2s ease",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "#ecfdf5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1.25rem",
              }}
            >
              <Radio size={24} />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem" }}>
              Dynamic Dijkstra Dispatch
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#64748b", lineHeight: 1.6, margin: 0 }}>
              Sub-second multi-modal rerouting instantly recalculates turn-by-turn navigation for emergency convoys, prioritizing medical consignments and fuel lifelines.
            </p>
          </div>
        </div>
      </section>



      {/* ──────────────────────────────────────────────────────────
          ABOUT SECTION
          ────────────────────────────────────────────────────────── */}
      <section id="about" style={{ padding: "8rem 1.75rem", background: "#ffffff", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#3b82f6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
              About Pravaha
            </div>
            <h2 style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", color: "#0f172a", marginBottom: "1.5rem" }}>
              Navigating the Northeast with<br/>AI Precision.
            </h2>
            <p style={{ fontSize: "1.1rem", color: "#64748b", maxWidth: "700px", margin: "0 auto", lineHeight: 1.7 }}>
              PRAVAHA is an autonomous, AI-driven spatial intelligence network designed specifically for the unique topographical and meteorological challenges of the North Eastern Region (NER). We bridge the gap between rugged terrain and seamless logistics.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            {[
              { icon: <MapPin size={24} />, title: "Hyper-Local Topography", desc: "Real-time 3D terrain modeling that understands every elevation change and valley dip in the NER." },
              { icon: <ShieldAlert size={24} />, title: "Predictive Hazard Alerts", desc: "Machine learning algorithms that predict landslides, flooding, and road blockages before they disrupt supply chains." },
              { icon: <Navigation size={24} />, title: "Dynamic Rerouting", desc: "Autonomous vehicle and fleet routing that adapts to real-time weather and road conditions on the fly." }
            ].map((feature, idx) => (
              <div key={idx} style={{ padding: "2.5rem 2rem", background: "#f8fafc", borderRadius: "24px", transition: "transform 0.3s ease, box-shadow 0.3s ease", cursor: "default" }} className="about-card">
                <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "#eff6ff", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
                  {feature.icon}
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", marginBottom: "1rem" }}>{feature.title}</h3>
                <p style={{ color: "#475569", lineHeight: 1.6, margin: 0 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          SOLUTIONS SECTION
          ────────────────────────────────────────────────────────── */}
      <section id="solutions" style={{ padding: "8rem 1.75rem", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
              Our Solutions
            </div>
            <h2 style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", color: "#0f172a", marginBottom: "1.5rem" }}>
              Tailored Portals for<br/>Every Stakeholder.
            </h2>
            <p style={{ fontSize: "1.1rem", color: "#64748b", maxWidth: "600px", margin: "0 auto", lineHeight: 1.7 }}>
              PRAVAHA provides specialized, role-based interfaces designed to empower citizens, government bodies, and logistics fleets.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem" }}>
            {[
              { 
                icon: <Truck size={32} />, 
                title: "Logistics Fleet", 
                desc: "Enterprise dashboards for fleet managers. Optimize routes, monitor vehicle health, and avoid disruptions in real-time.",
                color: "#f59e0b", bg: "#fef3c7"
              },
              { 
                icon: <Shield size={32} />, 
                title: "Gov Command", 
                desc: "High-level administrative oversight. Manage road closures, dispatch emergency services, and monitor regional safety.",
                color: "#3b82f6", bg: "#eff6ff"
              },
              { 
                icon: <MapPin size={32} />, 
                title: "Public Corridor", 
                desc: "A simplified, accessible interface for citizens to check road safety, weather conditions, and active hazards before traveling.",
                color: "#10b981", bg: "#d1fae5"
              }
            ].map((solution, idx) => (
              <div key={idx} style={{ padding: "3rem 2.5rem", background: "#ffffff", borderRadius: "24px", boxShadow: "0 4px 6px rgba(0,0,0,0.02), 0 10px 15px rgba(0,0,0,0.03)", transition: "transform 0.3s ease", cursor: "pointer" }} className="solution-card">
                <div style={{ width: "72px", height: "72px", borderRadius: "20px", background: solution.bg, color: solution.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "2rem" }}>
                  {solution.icon}
                </div>
                <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", marginBottom: "1rem" }}>{solution.title}</h3>
                <p style={{ color: "#64748b", lineHeight: 1.6, margin: 0, fontSize: "1.05rem" }}>{solution.desc}</p>
                
                <div style={{ marginTop: "2rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", color: solution.color, fontWeight: 700, fontSize: "0.95rem" }}>
                  Explore Portal <ArrowRight size={16} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          FEATURES SECTION
          ────────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: "8rem 1.75rem", background: "#ffffff" }}>
        <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f59e0b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1rem" }}>
              Core Capabilities
            </div>
            <h2 style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", color: "#0f172a", marginBottom: "1.5rem" }}>
              Engineered for the Edge.
            </h2>
            <p style={{ fontSize: "1.1rem", color: "#64748b", maxWidth: "600px", margin: "0 auto", lineHeight: 1.7 }}>
              Advanced algorithms and distributed edge computing power our intelligence platform, making it resilient even in low-connectivity zones.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "3rem 2.5rem" }}>
            {[
              { icon: <Activity size={24} />, title: "Live Activity Tracking", desc: "Monitor all fleet movements and logistical nodes with zero latency." },
              { icon: <Layers size={24} />, title: "Multi-Modal Support", desc: "Seamlessly coordinate across road, river, and air transport modalities." },
              { icon: <Radio size={24} />, title: "Offline Syncing", desc: "Edge-caching allows field ops to work offline and sync when connected." },
              { icon: <Sparkles size={24} />, title: "AI Gen-Insight", desc: "Generative AI parses unstructured reports into actionable analytics." },
              { icon: <Clock size={24} />, title: "Time-Sensitive Routing", desc: "Prioritize emergency and medical supply deliveries automatically." },
              { icon: <Compass size={24} />, title: "Terrain Mapping", desc: "3D topographical routing specifically tuned for the Himalayas." }
            ].map((feat, idx) => (
              <div key={idx} style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#f8fafc", color: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #e2e8f0" }}>
                  {feat.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.5rem" }}>{feat.title}</h3>
                  <p style={{ color: "#64748b", lineHeight: 1.6, margin: 0, fontSize: "0.95rem" }}>{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* ──────────────────────────────────────────────────────────
          FOOTER
          ────────────────────────────────────────────────────────── */}
      <footer
        style={{
          background: "#0f172a",
          color: "#94a3b8",
          padding: "5rem 1.75rem 2rem",
          borderTop: "1px solid #1e293b",
        }}
      >
        <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "4rem", marginBottom: "4rem" }}>
            {/* Brand Column */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <Image 
                  src="/logo-primary.png" 
                  alt="Pravaha Logo" 
                  width={36} 
                  height={36} 
                  style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} 
                  unoptimized={true}
                />
                <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.03em" }}>PRAVAHA</span>
              </div>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                AI-Based Smart Logistics &amp; Accessibility Intelligence Platform for the North Eastern Region (NER).
              </p>
              <div style={{ display: "flex", gap: "1rem" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5 5 9.2 5 9.2c.8.4 1.7.5 2.5.4-3.2-2.1-1.4-7.5-1.4-7.5 3.3 4 8 4.6 11.2 4.1C16 1.8 20.3 3 22 4z"/></svg>
                </div>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                </div>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                </div>
              </div>
            </div>

            {/* Links Column 1 */}
            <div>
              <h4 style={{ color: "#ffffff", fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Platform</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <a href="#about" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>About Pravaha</a>
                <a href="#solutions" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>Our Solutions</a>
                <a href="#features" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>Core Capabilities</a>
                <a href="#" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>How It Works</a>
                <a href="#" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>System Status</a>
              </div>
            </div>

            {/* Links Column 2 */}
            <div>
              <h4 style={{ color: "#ffffff", fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Portals</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Link href="/public" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>Public Corridor</Link>
                <Link href="/gov" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>Gov Command Center</Link>
                <Link href="/logistics" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>Logistics Fleet Console</Link>
                <Link href="/field" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.95rem", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"} onMouseOut={(e) => e.currentTarget.style.color = "#94a3b8"}>Field Ops App</Link>
              </div>
            </div>

            {/* Acknowledgements Column */}
            <div>
              <h4 style={{ color: "#ffffff", fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Initiative</h4>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1rem" }}>
                Developed for the <strong>Smart India Hackathon (SIH 2026)</strong>.
              </p>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
                Addressing problem statements set forth by the <strong>Ministry of Development of North Eastern Region (MDoNER)</strong> and the <strong>North Eastern Council</strong>.
              </p>
            </div>
          </div>

          {/* Bottom Bar */}
          <div style={{ borderTop: "1px solid #1e293b", paddingTop: "2rem", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "0.85rem" }}>
              &copy; {new Date().getFullYear()} PRAVAHA NER Spatial AI. All rights reserved.
            </div>
            <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.85rem" }}>
              <a href="#" style={{ color: "#94a3b8", textDecoration: "none" }} onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"} onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}>Privacy Policy</a>
              <a href="#" style={{ color: "#94a3b8", textDecoration: "none" }} onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"} onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}>Terms of Service</a>
              <a href="#" style={{ color: "#94a3b8", textDecoration: "none" }} onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"} onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}>Contact Us</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ──────────────────────────────────────────────────────────
          FLOATING QUICK ASSISTANT ACTION BUTTON (Matches Screenshots)
          ────────────────────────────────────────────────────────── */}
      <Link
        href="/public"
        style={{
          position: "fixed",
          bottom: "28px",
          right: "28px",
          zIndex: 50,
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "#0284c7",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 25px rgba(2, 132, 199, 0.4)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          textDecoration: "none",
        }}
        title="Quick Corridor Passability Checker"
        className="anim-float"
      >
        <MessageSquare size={24} />
      </Link>

      <style jsx global>{`
        @media (max-width: 960px) {
          .desktop-nav {
            display: none !important;
          }
          .hero-grid {
            grid-template-columns: 1fr !important;
            gap: 3.5rem !important;
          }
        }
        .about-card:hover, .solution-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.06), 0 5px 15px rgba(0,0,0,0.04) !important;
        }
      `}</style>
    </div>
    </ReactLenis>
  );
}

