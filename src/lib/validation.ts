/** Small validators for Indian business data. */

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Jharkhand's GST state code. */
export const JHARKHAND_STATE_CODE = "20";

/** The 15th character of a GSTIN is a checksum of the first 14. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export function normalizeGstin(gstin: string): string {
  return gstin.replace(/\s/g, "").toUpperCase();
}

export function isValidGstin(gstin: string): boolean {
  const g = normalizeGstin(gstin);
  return GSTIN_RE.test(g) && gstinCheckChar(g.slice(0, 14)) === g[14];
}

/** Keep only the 10-digit mobile number (drops +91, leading 0, spaces, dashes). */
export function normalizeMobile(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidMobile(text: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobile(text));
}

/** A shop phone can be a mobile or a landline with STD code (e.g. 06542 xxxxxx): 10–12 digits. */
export function isValidPhone(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 12;
}

/** UPI IDs look like name@bank. */
export function isValidUpiId(text: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/.test(text.trim());
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}
