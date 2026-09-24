/**
 * Prepares a value for safe CSV inclusion:
 * 1. Guards against spreadsheet formula injection (=, +, -, @).
 * 2. Escapes double quotes and wraps in quotes if delimiter, newline or quote exists.
 */
export function csvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);

  // Guard against spreadsheet formula execution
  if (str.startsWith("=") || str.startsWith("+") || str.startsWith("-") || str.startsWith("@")) {
    str = "'" + str;
  }

  // If contains comma, quote, or newline, escape and quote
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Serializes headers and rows into an RFC 4180 compliant CSV string with CRLF line breaks.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(csvCell).join(",");
  const rowLines = rows.map((r) => r.map(csvCell).join(","));
  return [headerLine, ...rowLines].join("\r\n");
}

/**
 * Transforms an uppercase or snake_case / kebab-case string into sentence-cased human readable text.
 */
export function humanize(val: string | null | undefined): string {
  if (!val) return "";
  const clean = val.replace(/[_-]+/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/**
 * Returns a shortened prefix of an ID (defaults to 8 characters).
 */
export function shortId(id: string | null | undefined, len = 8): string {
  if (!id) return "";
  return id.slice(0, len);
}

/**
 * Formats weight in kilograms with locale thousand separators.
 */
export function formatKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined || isNaN(kg)) return "Not specified";
  return `${kg.toLocaleString()} kg`;
}

/**
 * Formats latitude and longitude coordinates into a concise readable string.
 */
export function formatCoords(lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat === null || lat === undefined || lon === null || lon === undefined || isNaN(lat) || isNaN(lon)) {
    return "No coordinates";
  }
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

/**
 * Triggers a browser file download for a text blob.
 */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
