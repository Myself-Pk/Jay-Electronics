/**
 * Bill arithmetic, shared by the New Bill screen and Preview mode.
 * The database (save_bill) repeats the same rules and is the final word.
 *
 *   total   = items − old battery + card/finance charges, rounded to the rupee
 *   paid    = every payment (including card charges) + Bajaj loan amount
 *   balance = total − paid   → this is the udhaar on the bill
 */
import { roundToRupee, type BasisPoints, type Paise } from "./money";

/** Card charges are a percentage of the amount paid by card, rounded to whole rupees. */
export function cardCharge(towards: Paise, bp: BasisPoints): Paise {
  if (towards <= 0 || bp <= 0) return 0;
  return Math.floor((towards * bp + 500_000) / 1_000_000) * 100;
}

/**
 * Value of an old battery taken in exchange.
 * Weight is in hundredths of a kg (18.5 kg = 1850), rate is paise per kg.
 */
export function scrapByWeight(weightCentiKg: number, ratePerKg: Paise): Paise {
  if (weightCentiKg <= 0 || ratePerKg <= 0) return 0;
  return Math.floor((weightCentiKg * ratePerKg + 50) / 100);
}

export interface TotalsInput {
  lines: { qty: number; rate: Paise }[];
  scrapValues: Paise[];
  payments: { towards: Paise; charges: Paise }[];
  finance?: { loanAmount: Paise; customerCharges: Paise } | null;
}

export interface BillTotals {
  subtotal: Paise;
  scrapCredit: Paise;
  extraCharges: Paise;
  roundOff: Paise;
  total: Paise;
  paid: Paise;
  balance: Paise;
}

export function computeTotals({ lines, scrapValues, payments, finance }: TotalsInput): BillTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const scrapCredit = scrapValues.reduce((sum, v) => sum + v, 0);
  const cardCharges = payments.reduce((sum, p) => sum + p.charges, 0);
  const extraCharges = cardCharges + (finance?.customerCharges ?? 0);
  const { total, roundOff } = roundToRupee(subtotal - scrapCredit + extraCharges);
  const paid = payments.reduce((sum, p) => sum + p.towards + p.charges, 0) + (finance?.loanAmount ?? 0);
  return { subtotal, scrapCredit, extraCharges, roundOff, total, paid, balance: total - paid };
}

/** Warranty line printed on the bill, e.g. "48 months free + 24 months pro-rata". */
export function warrantyText(freeMonths: number, prorataMonths: number): string {
  if (freeMonths > 0 && prorataMonths > 0) return `${freeMonths} months free + ${prorataMonths} months pro-rata`;
  if (freeMonths > 0) return `${freeMonths} months warranty`;
  return "";
}

// ---------- GST (Regular scheme; prices include GST) ----------

/**
 * The GST part of a GST-inclusive amount, rounded half-up to the paisa — exactly like save_bill:
 * round(amount − amount × 100 / (100 + rate), 2) = amount × rate / (100 + rate).
 * ₹1,180 at 18% → ₹180. Integer maths only (no floating-point rupees).
 */
export function gstInside(amount: Paise, rate: BasisPoints): Paise {
  if (rate <= 0 || amount === 0) return 0;
  const sign = amount < 0 ? -1 : 1;
  const num = Math.abs(amount) * rate;
  const den = 10_000 + rate;
  return sign * Math.floor((2 * num + den) / (2 * den));
}

/** CGST and SGST halves of a GST amount (the odd paisa goes to CGST). */
export function splitCgstSgst(gst: Paise): { cgst: Paise; sgst: Paise } {
  const cgst = Math.ceil(gst / 2);
  return { cgst, sgst: gst - cgst };
}

/** GST rate charged on card / Bajaj charges (they're part of the price of the sale). */
export const CHARGES_GST_RATE: BasisPoints = 1800;

export interface TaxRow {
  /** Basis points: 18% = 1800 */
  rate: BasisPoints;
  taxable: Paise;
  gst: Paise;
}

/**
 * Tax summary for a Tax Invoice, one row per GST rate (what the printed bill shows at the bottom).
 * Each line's GST is worked out on its own amount (as save_bill does), then added up by rate;
 * card / Bajaj charges join the 18% row.
 */
export function taxSummary(lines: { amount: Paise; gstRate: BasisPoints; gst: Paise }[], charges: Paise): TaxRow[] {
  const rows = new Map<BasisPoints, TaxRow>();
  const add = (rate: BasisPoints, amount: Paise, gst: Paise) => {
    const row = rows.get(rate) ?? { rate, taxable: 0, gst: 0 };
    row.taxable += amount - gst;
    row.gst += gst;
    rows.set(rate, row);
  };
  for (const l of lines) if (l.gstRate > 0) add(l.gstRate, l.amount, l.gst);
  if (charges > 0) add(CHARGES_GST_RATE, charges, gstInside(charges, CHARGES_GST_RATE));
  return [...rows.values()].sort((a, b) => a.rate - b.rate);
}
