import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  HelpCircle,
  Loader2,
  Send,
  ShieldCheck,
  Truck,
  UserX,
  WifiOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { statusDef, type IconKey, type StatusKind } from "./status";

const ICONS: Record<IconKey, LucideIcon> = {
  check: CheckCircle2,
  alert: AlertTriangle,
  block: Ban,
  help: HelpCircle,
  clock: Clock,
  loader: Loader2,
  "wifi-off": WifiOff,
  shield: ShieldCheck,
  eye: Eye,
  send: Send,
  dot: Circle,
  x: XCircle,
  "user-x": UserX,
  truck: Truck,
};

interface Props {
  kind: StatusKind;
  value: string | null | undefined;
  /** Override the visible text (for example to append a count). The icon and tone still come from the value. */
  label?: string;
}

/**
 * Status is always conveyed by text plus an icon and a border style, never by color alone.
 * The description (when available) is exposed as a tooltip and to assistive technology.
 */
export function StatusBadge({ kind, value, label }: Props) {
  const def = statusDef(kind, value);
  const Icon = ICONS[def.icon];
  return (
    <span className={`badge tone-${def.tone}`} data-status={value ?? "none"} title={def.description}>
      <Icon size={14} aria-hidden="true" />
      <span>{label ?? def.label}</span>
    </span>
  );
}
