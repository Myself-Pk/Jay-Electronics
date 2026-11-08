/**
 * Money helpers.
 *
 * The database stores money as exact decimals (numeric(12,2)). In the app we do
 * every calculation in whole paise (₹1 = 100 paise) so there is never a
 * floating-point rounding error like 0.1 + 0.2 = 0.30000000000000004.
 */

/** A whole number of paise. ₹105.50 = 10550. */
export type Paise = number;

const AMOUNT_RE = /^(-)?(\d+)(?:\.(\d{0,2}))?$/;

function assertPaise(p: Paise) {
  if (!Number.isSafeInteger(p)) {
    throw new Error(`Expected a whole number of paise, got ${p}`);
  }
}

/**
 * Read an amount typed by a person ("1,234.5", "₹ 105", "105.50").
 * Returns null when it is not a valid amount (at most 2 decimal places).
 */
export function parseRupees(text: string): Paise | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const match = AMOUNT_RE.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[2]);
  const paise = Number((match[3] ?? "").padEnd(2, "0"));
  const value = rupees * 100 + paise;
  if (!Number.isSafeInteger(value)) return null;
  return match[1] ? -value : value;
}

/** Convert a value from the database (number or "1234.50") to paise. */
export function toPaise(value: number | string | null | undefined): Paise {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Not a valid amount: ${value}`);
    return Math.round(value * 100);
  }
  const parsed = parseRupees(value);
  if (parsed === null) throw new Error(`Not a valid amount: ${value}`);
  return parsed;
}

/** Convert paise to the exact decimal string the database expects ("1234.50"). */
export function fromPaise(p: Paise): string {
  assertPaise(p);
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const withPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Show an amount in Indian format: ₹1,23,456.50
 * - paise "auto" (default): show paise only when there are some
 * - paise "always": always 2 decimals (use on bills)
 * - paise "never": round to whole rupees (use on the dashboard)
 */
export function formatRupees(p: Paise, opts: { paise?: "auto" | "always" | "never" } = {}): string {
  assertPaise(p);
  const mode = opts.paise ?? "auto";
  const showPaise = mode === "always" || (mode === "auto" && p % 100 !== 0);
  if (showPaise) return withPaise.format(p / 100);
  return wholeRupees.format(roundToRupee(p).total / 100);
}

/** Short Indian-style amount for chart labels: ₹950, ₹13.5k, ₹1.2L, ₹2.4Cr */
export function compactRupees(p: Paise): string {
  const r = Math.round(p / 100);
  const short = (n: number) => (n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ""));
  if (r >= 10_000_000) return `₹${short(r / 10_000_000)}Cr`;
  if (r >= 100_000) return `₹${short(r / 100_000)}L`;
  if (r >= 1000) return `₹${short(r / 1000)}k`;
  return `₹${r}`;
}

/** Text to put in an amount input box: 10550 → "105.50", 10500 → "105". */
export function paiseToInput(p: Paise): string {
  return fromPaise(p).replace(/\.00$/, "");
}

/** Basis points: 1% = 100, 1.5% = 150. Percentages use the same 2-decimal rules as money. */
export type BasisPoints = number;

/** Read a percentage typed by a person ("1.5", "2%"). Returns null if not between 0 and 100. */
export function parsePercent(text: string): BasisPoints | null {
  const value = parseRupees(text.replace("%", ""));
  if (value === null || value < 0 || value > 10000) return null;
  return value;
}

/** 150 → "1.5", 100 → "1", 125 → "1.25" */
export function basisPointsToInput(bp: BasisPoints): string {
  return fromPaise(bp).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** 150 → "1.5%" */
export function formatPercent(bp: BasisPoints): string {
  return `${basisPointsToInput(bp)}%`;
}

/** Amount × percentage, rounded half-up to the nearest paisa. */
export function percentOf(p: Paise, bp: BasisPoints): Paise {
  assertPaise(p);
  assertPaise(bp);
  const raw = p * bp;
  const sign = raw < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(raw) + 5000) / 10000);
}

/** Round a bill total to the nearest rupee and report the round-off amount. */
export function roundToRupee(p: Paise): { total: Paise; roundOff: Paise } {
  assertPaise(p);
  const sign = p < 0 ? -1 : 1;
  const total = sign * Math.floor((Math.abs(p) + 50) / 100) * 100;
  return { total, roundOff: total - p };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? twoDigits(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** "Rupees Thirteen Thousand Seven Hundred Ten and Fifty Paise Only" (Indian lakh/crore style). */
export function amountInWords(p: Paise): string {
  assertPaise(p);
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  let words = `Rupees ${indianWords(rupees)}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${p < 0 ? "Minus " : ""}${words} Only`;
}
