/**
 * The New Bill screen's working copy of a bill: what the person has typed so far,
 * plus the checks and totals worked out from it.
 */
import {
  canSeeOwnerData,
  productLabel,
  type BillPaymentMode,
  type CatalogProduct,
  type CustomerType,
  type Role,
  type SaveBillInput,
  type ShopSettings,
  type StockUnit,
} from "@/data/types";
import { cardCharge, computeTotals, scrapByWeight, type BillTotals } from "@/lib/billMath";
import { formatRupees, paiseToInput, parseRupees, type BasisPoints, type Paise } from "@/lib/money";
import { isValidGstin, isValidMobile, normalizeGstin, normalizeMobile } from "@/lib/validation";

export interface DraftLine {
  key: string;
  product: CatalogProduct;
  /** In-stock serial numbers to choose from, oldest first. */
  units: StockUnit[];
  /** The chosen in-stock unit, or null when a serial is typed instead. */
  unitId: string | null;
  serial: string;
  qty: number;
  rateText: string;
  priceEdited: boolean;
  /** Warranty months typed on this line; undefined = the product's own warranty. */
  warrantyFree?: string;
  warrantyProrata?: string;
}

export interface DraftScrap {
  key: string;
  batteryType: string;
  mode: "weight" | "fixed";
  weightText: string;
  rateText: string;
  fixedText: string;
}

export interface DraftPayment {
  key: string;
  mode: BillPaymentMode;
  amountText: string;
  chargesText: string;
  chargesEdited: boolean;
}

export interface DraftFinance {
  loanText: string;
  chargesText: string;
  reference: string;
}

export interface DraftCustomer {
  id: string | null;
  phone: string;
  name: string;
  area: string;
  type: CustomerType;
  /** A business customer's GSTIN (optional; Regular GST bills). */
  gstin?: string;
}

export interface BillDraft {
  customer: DraftCustomer;
  lines: DraftLine[];
  scrap: DraftScrap[];
  payments: DraftPayment[];
  finance: DraftFinance | null;
  /** Regular GST: true when this bill is made without GST on purpose (confirmed in a popup). */
  noGst?: boolean;
}

export const emptyDraft = (): BillDraft => ({
  customer: { id: null, phone: "", name: "", area: "", type: "retail" },
  lines: [],
  scrap: [],
  payments: [],
  finance: null,
});

let keyCounter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(keyCounter++).toString(36)}`;

export function defaultPrice(p: CatalogProduct, type: CustomerType): Paise {
  return type === "dealer" && p.dealerPrice !== null ? p.dealerPrice : p.retailPrice;
}

export function chargeRateFor(mode: BillPaymentMode, settings: ShopSettings): BasisPoints {
  if (mode === "debit_card") return settings.debitCardCharge;
  if (mode === "credit_card") return settings.creditCardCharge;
  return 0;
}

/** Re-price lines nobody has changed by hand, e.g. after switching Retail ↔ Dealer. */
export function repriceLines(lines: DraftLine[], type: CustomerType): DraftLine[] {
  return lines.map((l) => (l.priceEdited ? l : { ...l, rateText: paiseToInput(defaultPrice(l.product, type)) }));
}

/** The serial actually being sold on a line (chosen from stock, or typed). */
export function lineSerial(line: DraftLine): string {
  if (line.unitId) return line.units.find((u) => u.id === line.unitId)?.serial ?? "";
  return line.serial.trim().toUpperCase();
}

/**
 * Warranty printed on a bill line: what was typed on the bill, otherwise the product's own.
 * An empty box counts as 0. Returns null when a box isn't a whole number up to 240.
 */
export function lineWarranty(line: DraftLine): { free: number; prorata: number } | null {
  if (line.product.isService) return { free: 0, prorata: 0 };
  const months = (text: string | undefined, fallback: number): number | null => {
    if (text === undefined) return fallback;
    const v = text.trim();
    if (v === "") return 0;
    return /^\d{1,3}$/.test(v) && Number(v) <= 240 ? Number(v) : null;
  };
  const free = months(line.warrantyFree, line.product.warrantyFreeMonths);
  const prorata = months(line.warrantyProrata, line.product.warrantyProrataMonths);
  return free === null || prorata === null ? null : { free, prorata };
}

export interface Problem {
  key: string;
  params?: Record<string, string | number>;
}

export interface Evaluated {
  lineRates: (Paise | null)[];
  scrapValues: (Paise | null)[];
  payments: { towards: Paise | null; charges: Paise; rate: BasisPoints }[];
  finance: { loanAmount: Paise | null; customerCharges: Paise } | null;
  totals: BillTotals;
  needsCustomer: boolean;
  /** Must be fixed before saving. */
  problems: Problem[];
  /** Shown, but don't stop the bill. */
  warnings: Problem[];
}

export function evaluate(draft: BillDraft, settings: ShopSettings, role: Role | undefined): Evaluated {
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const owner = canSeeOwnerData(role);

  const lineRates = draft.lines.map((l) => parseRupees(l.rateText));
  const scrapValues = draft.scrap.map((s) => {
    if (s.mode === "fixed") return parseRupees(s.fixedText);
    const weight = parseRupees(s.weightText);
    const rate = parseRupees(s.rateText);
    return weight === null || rate === null ? null : scrapByWeight(weight, rate);
  });
  const payments = draft.payments.map((p) => {
    const towards = parseRupees(p.amountText);
    const rate = chargeRateFor(p.mode, settings);
    const charges = p.chargesEdited ? (parseRupees(p.chargesText) ?? 0) : cardCharge(towards ?? 0, rate);
    return { towards, charges: Math.max(charges, 0), rate };
  });
  const finance = draft.finance
    ? {
        loanAmount: parseRupees(draft.finance.loanText),
        customerCharges: Math.max(parseRupees(draft.finance.chargesText) ?? 0, 0),
      }
    : null;

  const totals = computeTotals({
    lines: draft.lines.map((l, i) => ({ qty: l.qty, rate: lineRates[i] ?? 0 })),
    scrapValues: scrapValues.map((v) => v ?? 0),
    payments: payments.map((p) => ({ towards: p.towards ?? 0, charges: p.charges })),
    finance: finance ? { loanAmount: finance.loanAmount ?? 0, customerCharges: finance.customerCharges } : null,
  });

  // ----- Items -----
  if (draft.lines.length === 0) problems.push({ key: "no_items" });
  const serialsSeen = new Set<string>();
  draft.lines.forEach((line, i) => {
    const product = productLabel(line.product);
    const rate = lineRates[i];
    if (rate === null || rate <= 0) problems.push({ key: "price_required", params: { product } });
    else {
      if (line.product.mrp !== null && rate > line.product.mrp) {
        problems.push({ key: "above_mrp", params: { product, mrp: formatRupees(line.product.mrp) } });
      }
      if (!owner && line.product.minPrice !== null && rate < line.product.minPrice) {
        problems.push({ key: "below_min", params: { product } });
      }
    }
    if (lineWarranty(line) === null) problems.push({ key: "bad_warranty", params: { product } });
    if (line.product.hasSerial) {
      const serial = lineSerial(line);
      if (!serial) problems.push({ key: "serial_required", params: { product } });
      else if (serialsSeen.has(serial)) problems.push({ key: "duplicate_serial", params: { serial } });
      else serialsSeen.add(serial);
    } else if (!line.product.isService) {
      const sameProduct = draft.lines.filter((l) => l.product.id === line.product.id).reduce((n, l) => n + l.qty, 0);
      if (sameProduct > line.product.inStock && !warnings.some((w) => w.params?.product === product)) {
        warnings.push({ key: "low_stock", params: { product, count: line.product.inStock } });
      }
    }
  });

  // ----- Old battery, payments -----
  if (scrapValues.some((v) => v === null || v <= 0)) problems.push({ key: "scrap_invalid" });
  if (payments.some((p) => p.towards === null || p.towards <= 0)) problems.push({ key: "payment_invalid" });
  if (finance && (finance.loanAmount === null || finance.loanAmount <= 0)) problems.push({ key: "bajaj_invalid" });
  if (totals.total < 0) problems.push({ key: "negative_total" });
  else if (totals.balance < 0) problems.push({ key: "overpaid", params: { amount: formatRupees(-totals.balance) } });

  // ----- Customer -----
  const needsCustomer = draft.lines.some((l) => l.product.hasSerial) || totals.balance > 0 || draft.finance !== null;
  const c = draft.customer;
  if ((c.gstin ?? "").trim() && !isValidGstin(c.gstin ?? "")) problems.push({ key: "bad_gstin" });
  const phoneTyped = c.phone.trim() !== "";
  if (!c.id) {
    if (phoneTyped && !isValidMobile(c.phone)) problems.push({ key: "bad_phone" });
    else if (needsCustomer && !phoneTyped) problems.push({ key: "customer_required" });
    else if (phoneTyped && !c.name.trim()) problems.push({ key: "name_required" });
  }

  return { lineRates, scrapValues, payments, finance, totals, needsCustomer, problems, warnings };
}

/** What gets sent to save_bill. Only call when evaluate() found no problems. */
export function toSaveInput(draft: BillDraft, ev: Evaluated): SaveBillInput {
  const c = draft.customer;
  const phone = normalizeMobile(c.phone);
  const gstin = (c.gstin ?? "").trim() ? { gstin: normalizeGstin(c.gstin ?? "") } : {};
  return {
    customer: c.id
      ? { id: c.id, type: c.type, ...gstin }
      : phone
        ? { phone, name: c.name.trim(), area: c.area.trim(), type: c.type, ...gstin }
        : { name: c.name.trim(), area: c.area.trim(), ...gstin },
    ...(draft.noGst ? { gst: false } : {}),
    items: draft.lines.map((l, i) => {
      // A typed serial that matches one of this product's in-stock units is treated as choosing that unit.
      const typed = l.unitId ? null : l.serial.trim().toUpperCase();
      const match = typed ? l.units.find((u) => u.serial.toUpperCase() === typed) : undefined;
      return {
        productId: l.product.id,
        unitId: l.unitId ?? match?.id ?? null,
        serialNo: l.product.hasSerial && !l.unitId && !match ? typed ?? "" : undefined,
        qty: l.qty,
        rate: ev.lineRates[i]!,
        // Every goods line sends its warranty, so the bill prints exactly what was shown.
        ...(l.product.isService
          ? {}
          : { warrantyFreeMonths: lineWarranty(l)!.free, warrantyProrataMonths: lineWarranty(l)!.prorata }),
      };
    }),
    scrap: draft.scrap.map((s, i) =>
      s.mode === "fixed"
        ? { batteryType: s.batteryType, fixedAmount: ev.scrapValues[i]! }
        : { batteryType: s.batteryType, weightCentiKg: parseRupees(s.weightText)!, ratePerKg: parseRupees(s.rateText)! },
    ),
    payments: draft.payments.map((p, i) => ({ mode: p.mode, towards: ev.payments[i].towards!, charges: ev.payments[i].charges })),
    finance:
      draft.finance && ev.finance
        ? {
            referenceNo: draft.finance.reference.trim(),
            loanAmount: ev.finance.loanAmount!,
            customerCharges: ev.finance.customerCharges,
          }
        : null,
  };
}
