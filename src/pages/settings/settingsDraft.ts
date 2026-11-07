/**
 * The Settings form keeps what the person typed as text ("105.50", "1.5"),
 * then checks and converts it to real values when they press Save.
 */
import type { GstScheme, ShopSettings } from "@/data/types";
import { isValidBillPrefix } from "@/lib/billNumber";
import { basisPointsToInput, paiseToInput, parsePercent, parseRupees } from "@/lib/money";
import { JHARKHAND_STATE_CODE, isValidGstin, isValidPhone, isValidUpiId, normalizeGstin } from "@/lib/validation";

export interface SettingsDraft {
  shopName: string;
  address: string;
  phone: string;
  gstin: string;
  upiId: string;
  billTerms: string;
  gstScheme: GstScheme;
  schemeFrom: string;
  compositionRate: string;
  billPrefix: string;
  nextBillNumber: string;
  scrapRatePerKg: string;
  debitCardCharge: string;
  creditCardCharge: string;
  deliveryPresets: string[];
}

/** Field name (or "deliveryPresets.0" for a list entry) → translation key of the error message. */
export type DraftErrors = Partial<Record<string, string>>;

export function toDraft(s: ShopSettings): SettingsDraft {
  return {
    shopName: s.shopName,
    address: s.address,
    phone: s.phone,
    gstin: s.gstin,
    upiId: s.upiId,
    billTerms: s.billTerms,
    gstScheme: s.gstScheme,
    schemeFrom: s.schemeFrom,
    compositionRate: basisPointsToInput(s.compositionRate),
    billPrefix: s.billPrefix,
    nextBillNumber: String(s.nextBillNumber),
    scrapRatePerKg: paiseToInput(s.scrapRatePerKg),
    debitCardCharge: basisPointsToInput(s.debitCardCharge),
    creditCardCharge: basisPointsToInput(s.creditCardCharge),
    deliveryPresets: s.deliveryPresets.map(paiseToInput),
  };
}

export type DraftResult = { ok: true; settings: ShopSettings } | { ok: false; errors: DraftErrors };

export function fromDraft(d: SettingsDraft): DraftResult {
  const errors: DraftErrors = {};

  const shopName = d.shopName.trim();
  if (!shopName) errors.shopName = "validation.required";

  const address = d.address.trim();
  if (!address) errors.address = "validation.required";

  const phone = d.phone.trim();
  if (phone && !isValidPhone(phone)) errors.phone = "validation.phone";

  const gstin = normalizeGstin(d.gstin);
  if (gstin) {
    if (!isValidGstin(gstin)) errors.gstin = "validation.gstin";
    else if (!gstin.startsWith(JHARKHAND_STATE_CODE)) errors.gstin = "validation.gstinState";
  }

  const upiId = d.upiId.trim();
  if (upiId && !isValidUpiId(upiId)) errors.upiId = "validation.upi";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.schemeFrom)) errors.schemeFrom = "validation.required";

  const compositionRate = parsePercent(d.compositionRate);
  if (compositionRate === null) errors.compositionRate = "validation.percent";

  const billPrefix = d.billPrefix.trim().toUpperCase();
  if (!isValidBillPrefix(billPrefix)) errors.billPrefix = "validation.prefix";

  const nextBillNumber = /^\d{1,5}$/.test(d.nextBillNumber.trim()) ? Number(d.nextBillNumber.trim()) : NaN;
  if (!(nextBillNumber >= 1)) errors.nextBillNumber = "validation.wholeNumber";

  const scrapRatePerKg = parseRupees(d.scrapRatePerKg);
  if (scrapRatePerKg === null || scrapRatePerKg < 0) errors.scrapRatePerKg = "validation.amount";

  const debitCardCharge = parsePercent(d.debitCardCharge);
  if (debitCardCharge === null) errors.debitCardCharge = "validation.percent";

  const creditCardCharge = parsePercent(d.creditCardCharge);
  if (creditCardCharge === null) errors.creditCardCharge = "validation.percent";

  const deliveryPresets: number[] = [];
  d.deliveryPresets.forEach((text, i) => {
    if (!text.trim()) return; // empty boxes are simply ignored
    const value = parseRupees(text);
    if (value === null || value <= 0) errors[`deliveryPresets.${i}`] = "validation.amount";
    else deliveryPresets.push(value);
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    settings: {
      shopName,
      address,
      phone,
      gstin,
      upiId,
      billTerms: d.billTerms.trim(),
      gstScheme: d.gstScheme,
      schemeFrom: d.schemeFrom,
      compositionRate: compositionRate!,
      billPrefix,
      nextBillNumber,
      scrapRatePerKg: scrapRatePerKg!,
      debitCardCharge: debitCardCharge!,
      creditCardCharge: creditCardCharge!,
      deliveryPresets: [...new Set(deliveryPresets)].sort((a, b) => a - b),
    },
  };
}
