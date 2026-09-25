import type { ReportPayload } from "./model";

/**
 * Last-resort channel for when there is cellular signal for SMS but no usable data connection.
 * It only pre-fills the phone's SMS app with a compact text; the officer still presses send.
 *
 * Nothing receives these messages automatically. Control-room staff read them and enter the report by
 * hand, so the app never marks a report as sent because of an SMS.
 */
export const SMS_MAX_CHARS = 160;

/** Control-room SMS number for this deployment. Unset means the feature is hidden. */
export function fieldSmsNumber(): string | null {
  return process.env.NEXT_PUBLIC_FIELD_SMS_NUMBER?.trim().replace(/[^\d+]/g, "") || null;
}

/** GSM-friendly: printable ASCII only, single spaces. */
function ascii(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

const LANE_SHORT: Record<string, string> = {
  BOTH_BLOCKED: "BOTH-LANES-BLOCKED",
  SINGLE_LANE_OPEN: "1-LANE-OPEN",
  SHOULDER_ONLY: "SHOULDER-ONLY",
  CLEAR: "CLEAR",
};

export interface SmsContext {
  /** Short reference so the control room can match the SMS to the report that syncs later. */
  ref: string;
  /** e.g. "NH-6 KM 12.4" */
  chainage?: string | null;
}

export function buildSmsReport(p: ReportPayload, { ref, chainage }: SmsContext): string {
  const t = new Date(p.observedAt);
  const hhmm = `${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;
  const parts = [
    `PARVA ${ref}`,
    p.reportType ?? "REPORT",
    p.severity ?? "",
    p.location ? `${p.location.latitude.toFixed(4)},${p.location.longitude.toFixed(4)} +-${Math.round(p.location.accuracy_m)}m` : "NO-GPS",
    chainage ? ascii(chainage) : "",
    p.laneStatus ? (LANE_SHORT[p.laneStatus] ?? p.laneStatus) : "",
    p.lifeSafetyRisk ? "LIFE-RISK" : "",
    `t${hhmm}`,
  ].filter(Boolean);
  const head = parts.join(" ");
  // The free-text note gets whatever room is left in one SMS.
  const room = SMS_MAX_CHARS - head.length - 3;
  const notes = room > 8 ? ascii(p.description).replace(/^\[[^\]]*\]\s*/, "").slice(0, room) : "";
  return notes ? `${head} | ${notes}` : head;
}

/** `sms:` link. iOS separates the body with "&", Android with "?". */
export function smsHref(number: string, body: string, userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  const sep = /iPhone|iPad|iPod/i.test(userAgent) ? "&" : "?";
  return `sms:${number}${sep}body=${encodeURIComponent(body)}`;
}
