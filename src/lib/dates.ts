/** Date helpers. The shop computer runs on Indian time, so local dates are used. */

/** Today's date as yyyy-mm-dd (local time). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of this week, as yyyy-mm-dd. */
export function startOfWeekISO(now: Date = new Date()): string {
  const d = new Date(now);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return todayISO(d);
}

/** First day of this month, as yyyy-mm-dd. */
export function startOfMonthISO(now: Date = new Date()): string {
  return todayISO(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** Parse yyyy-mm-dd as a local date (not UTC). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function locale(lang: string) {
  return lang === "hi" ? "hi-IN" : "en-IN";
}

/** 7 Nov 2026 */
export function formatDate(value: Date | string, lang = "en"): string {
  const date = typeof value === "string" ? parseISODate(value) : value;
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** Saturday, 7 Nov 2026 */
export function formatLongDate(value: Date, lang = "en"): string {
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

/** 10:02 am */
export function formatTime(value: Date | string, lang = "en"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale(lang), { hour: "numeric", minute: "2-digit" }).format(date);
}
