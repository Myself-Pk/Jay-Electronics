/**
 * Bill numbers look like JE/26-27/0001.
 * GST rules: unique within a financial year (April–March), consecutive, at most 16 characters.
 */

export const MAX_BILL_NUMBER_LENGTH = 16;

/** Indian financial year for a date. 7 Nov 2026 → { startYear: 2026, label: "26-27" }. */
export function financialYearOf(date: Date): { startYear: number; label: string } {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1; // April is month 3
  const twoDigits = (n: number) => String(n % 100).padStart(2, "0");
  return { startYear, label: `${twoDigits(startYear)}-${twoDigits(startYear + 1)}` };
}

/** 1–4 capital letters or digits, e.g. "JE". */
export function isValidBillPrefix(prefix: string): boolean {
  return /^[A-Z0-9]{1,4}$/.test(prefix);
}

export function formatBillNumber(prefix: string, date: Date, sequence: number): string {
  if (!isValidBillPrefix(prefix)) throw new Error(`Invalid bill prefix: ${prefix}`);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid bill sequence: ${sequence}`);
  }
  const number = `${prefix}/${financialYearOf(date).label}/${String(sequence).padStart(4, "0")}`;
  if (number.length > MAX_BILL_NUMBER_LENGTH) {
    throw new Error(`Bill number ${number} is longer than ${MAX_BILL_NUMBER_LENGTH} characters`);
  }
  return number;
}
