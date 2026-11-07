import type { ShopSettings } from "./types";

export const COMPOSITION_DECLARATION = "Composition taxable person, not eligible to collect tax on supplies";

export const DEFAULT_BILL_TERMS = [
  "1. Warranty is given by the manufacturer as per their terms and conditions.",
  "2. Please keep this bill safely. It is needed for any warranty claim.",
  "3. Subject to Bokaro jurisdiction.",
].join("\n");

/** Starting settings for a new shop. Everything here can be changed in Settings. */
export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: "Jay Electronics",
  address: "Bokaro, Jharkhand",
  phone: "",
  gstin: "",
  upiId: "",
  billTerms: DEFAULT_BILL_TERMS,
  gstScheme: "composition",
  schemeFrom: "2026-04-01",
  compositionRate: 100, // 1%
  billPrefix: "JE",
  nextBillNumber: 1,
  scrapRatePerKg: 10500, // ₹105 per kg
  debitCardCharge: 100, // 1%
  creditCardCharge: 200, // 2%
  deliveryPresets: [20000, 30000, 50000], // ₹200, ₹300, ₹500
};
