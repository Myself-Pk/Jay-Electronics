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
