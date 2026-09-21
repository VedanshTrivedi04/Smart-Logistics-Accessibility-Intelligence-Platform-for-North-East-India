"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Tone } from "./status";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted" style={{ margin: 0 }}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, actions, children, className = "", id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const headingId = useId();
  return (
    <section className={`card ${className}`} aria-labelledby={title ? headingId : undefined} id={id}>
      {title || actions ? (
        <header>
          {title ? <h2 id={headingId}>{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="value">{value}</span>
      <span className="label">{label}</span>
      {hint ? <span className="small muted">{hint}</span> : null}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger";
  size?: "normal" | "large" | "small";
  busy?: boolean;
}

export function Button({ variant = "default", size = "normal", busy, className = "", children, disabled, type = "button", ...rest }: ButtonProps) {
  const cls = ["btn", variant === "default" ? "" : variant, size === "normal" ? "" : size, className].filter(Boolean).join(" ");
  return (
    <button {...rest} type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? "Working…" : children}
    </button>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

const BANNER_ICON: Record<string, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  caution: AlertTriangle,
  danger: AlertOctagon,
  info: Info,
  neutral: Info,
  unknown: Info,
};

export function Banner({ tone = "info", title, children, role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; role?: "status" | "alert" }) {
  const Icon = BANNER_ICON[tone] ?? Info;
  return (
    <div className={`banner tone-${tone}`} role={role ?? (tone === "danger" ? "alert" : "status")}>
      <Icon size={18} aria-hidden="true" />
      <div>
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" className="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal bars with numeric labels; the number is always shown so the chart is not color/size-only. */
export function Bars({ rows, ariaLabel }: { rows: Array<{ label: string; value: number }>; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars" role="img" aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}>
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span>{r.label}</span>
          <span className="bar" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden="true" />
          <span className="mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function useDisclosure(initial = false): [boolean, () => void] {
  const [open, setOpen] = useState(initial);
  return [open, () => setOpen((o) => !o)];
}
