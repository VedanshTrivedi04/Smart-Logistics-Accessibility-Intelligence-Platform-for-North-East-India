/**
 * Clock abstraction to allow deterministic timestamps in tests and components.
 */
export const clock = {
  now: (): Date => new Date(),
};

export type TimeInput = string | Date | number | null | undefined;

function toDate(val: TimeInput): Date | null {
  if (val === null || val === undefined || val === "") return null;
  const d = val instanceof Date ? val : new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Calculates the age of a timestamp in seconds relative to `now`.
 * Returns null if the timestamp is missing or invalid.
 */
export function ageSeconds(input: TimeInput, now: Date = clock.now()): number | null {
  const d = toDate(input);
  if (!d) return null;
  return Math.floor((now.getTime() - d.getTime()) / 1000);
}

/**
 * Calculates remaining seconds until a future timestamp relative to `now`.
 * Returns negative if the time has already passed.
 */
export function secondsUntil(input: TimeInput, now: Date = clock.now()): number | null {
  const d = toDate(input);
  if (!d) return null;
  return Math.floor((d.getTime() - now.getTime()) / 1000);
}

/**
 * Expresses timestamp age in plain words (e.g. "just now", "12 minutes ago").
 */
export function formatAge(input: TimeInput, now: Date = clock.now()): string {
  if (input === null || input === undefined || input === "") return "unknown time";
  const sec = ageSeconds(input, now);
  if (sec === null) return "unknown time";
  if (sec < 60) return "just now";

  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/**
 * Formats duration in seconds into human-readable hours and minutes (e.g. "1 h 30 min", "45 min", "30s").
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;

  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

/**
 * Formats a date-time value (Date, ISO string, or timestamp) into a localized, human-readable date & time.
 */
export function formatDateTime(input: TimeInput): string {
  const d = toDate(input);
  if (!d) return "—";

  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

