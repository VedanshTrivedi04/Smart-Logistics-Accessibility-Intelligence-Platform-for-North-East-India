"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ label, items }: { label: string; items: Array<{ href: string; label: string; exact?: boolean }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="tabs">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link key={i.href} href={i.href} className="tab" aria-current={active ? "page" : undefined} style={{ textDecoration: "none", ...(active ? { color: "var(--brand)", borderBottomColor: "var(--brand)", fontWeight: 600 } : {}) }}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
