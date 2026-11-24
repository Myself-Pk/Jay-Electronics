import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/data/defaults";
import type { CatalogProduct } from "@/data/types";
import { emptyDraft, evaluate, lineWarranty, repriceLines, toSaveInput, type BillDraft, type DraftLine } from "./billDraft";

const battery: CatalogProduct = {
  id: "p-bat",
  brand: "Amaron",
  categoryId: "cat-1",
  category: "Inverter battery",
  categoryOrder: 1,
  gstRate: 1800,
  model: "Tall Tubular",
  capacity: "150Ah",
  type: "",
  mrp: 1_750_000,
  retailPrice: 1_450_000,
  dealerPrice: 1_360_000,
  minPrice: 1_300_000,
  hasSerial: true,
  isService: false,
  warrantyFreeMonths: 48,
  warrantyProrataMonths: 24,
  needsRegistration: true,
  lowStockLevel: 2,
  inStock: 2,
  hsn: "8507",
};
const trolley: CatalogProduct = { ...battery, id: "p-trolley", brand: null, model: "Battery Trolley", capacity: "", mrp: null,
  retailPrice: 80_000, dealerPrice: null, minPrice: null, hasSerial: false, needsRegistration: false, inStock: 1 };

const line = (product: CatalogProduct, extra: Partial<DraftLine> = {}): DraftLine => ({
  key: product.id + Math.random(),
  product,
  units: product.hasSerial ? [{ id: "u1", serial: "AMR-001", arrivedOn: "2026-09-01" }, { id: "u2", serial: "AMR-002", arrivedOn: null }] : [],
  unitId: product.hasSerial ? "u1" : null,
  serial: "",
  qty: 1,
  rateText: String(product.retailPrice / 100),
  priceEdited: false,
  ...extra,
});

const draftWith = (patch: Partial<BillDraft>): BillDraft => ({ ...emptyDraft(), ...patch });
const keys = (d: BillDraft, role: "owner" | "staff" = "staff") => evaluate(d, DEFAULT_SETTINGS, role).problems.map((p) => p.key);

describe("New Bill checks", () => {
  it("an empty bill needs items", () => {
    expect(keys(emptyDraft())).toEqual(["no_items"]);
  });

  it("batteries need a customer mobile number (for warranty)", () => {
    expect(keys(draftWith({ lines: [line(battery)], payments: [] }))).toContain("customer_required");
    const ok = draftWith({
      customer: { id: null, phone: "98765 00001", name: "Sunil", area: "", type: "retail" },
      lines: [line(battery)],
      payments: [{ key: "p", mode: "cash", amountText: "14500", chargesText: "", chargesEdited: false }],
    });
    expect(keys(ok)).toEqual([]);
  });

  it("a walk-in customer can pay cash for a trolley without a phone number", () => {
    const d = draftWith({
      lines: [line(trolley)],
      payments: [{ key: "p", mode: "cash", amountText: "800", chargesText: "", chargesEdited: false }],
    });
    expect(keys(d)).toEqual([]);
  });

  it("udhaar needs a customer", () => {
    const d = draftWith({ lines: [line(trolley)] });
    expect(keys(d)).toEqual(["customer_required"]);
  });

  it("catches price above MRP and below the minimum (staff only)", () => {
    const customer = { id: "c1", phone: "", name: "", area: "", type: "retail" as const };
    expect(keys(draftWith({ customer, lines: [line(battery, { rateText: "18000" })] }))).toContain("above_mrp");
    expect(keys(draftWith({ customer, lines: [line(battery, { rateText: "12000" })] }))).toContain("below_min");
    expect(keys(draftWith({ customer, lines: [line(battery, { rateText: "12000" })] }), "owner")).not.toContain("below_min");
  });

  it("catches the same serial twice, a missing serial and a missing price", () => {
    const customer = { id: "c1", phone: "", name: "", area: "", type: "retail" as const };
    expect(keys(draftWith({ customer, lines: [line(battery), line(battery)] }))).toContain("duplicate_serial");
    expect(keys(draftWith({ customer, lines: [line(battery, { unitId: null, serial: "" })] }))).toContain("serial_required");
    expect(keys(draftWith({ customer, lines: [line(trolley, { rateText: "" })] }))).toContain("price_required");
  });

  it("catches overpayment", () => {
    const d = draftWith({
      lines: [line(trolley)],
      payments: [{ key: "p", mode: "cash", amountText: "900", chargesText: "", chargesEdited: false }],
    });
    expect(keys(d)).toEqual(["overpaid"]);
  });

  it("adds card charges automatically, and the full due by card settles the bill", () => {
    const d = draftWith({
      customer: { id: "c1", phone: "", name: "", area: "", type: "retail" },
      lines: [line(battery)],
      payments: [{ key: "p", mode: "credit_card", amountText: "14500", chargesText: "", chargesEdited: false }],
    });
    const ev = evaluate(d, DEFAULT_SETTINGS, "staff");
    expect(ev.payments[0].charges).toBe(29_000); // 2% of ₹14,500 = ₹290
    expect(ev.totals.total).toBe(1_479_000);
    expect(ev.totals.balance).toBe(0);
    expect(ev.problems).toEqual([]);
  });

  it("warns (but allows) selling more of a non-serial item than the stock shows", () => {
    const d = draftWith({
      lines: [line(trolley, { qty: 2 })],
      payments: [{ key: "p", mode: "cash", amountText: "1600", chargesText: "", chargesEdited: false }],
    });
    const ev = evaluate(d, DEFAULT_SETTINGS, "staff");
    expect(ev.problems).toEqual([]);
    expect(ev.warnings.map((w) => w.key)).toEqual(["low_stock"]);
  });

  it("switching to Dealer re-prices lines that weren't changed by hand", () => {
    const lines = repriceLines([line(battery), line(battery, { rateText: "14000", priceEdited: true })], "dealer");
    expect(lines.map((l) => l.rateText)).toEqual(["13600", "14000"]);
  });
});

describe("toSaveInput", () => {
  it("sends a typed serial that matches stock as that unit, and a new serial as a serial", () => {
    const d = draftWith({
      customer: { id: null, phone: "+91 98765 00001", name: " Sunil ", area: "Chas", type: "retail" },
      lines: [line(battery, { unitId: null, serial: "amr-002" }), line(battery, { unitId: null, serial: "new-9" })],
      scrap: [{ key: "s", batteryType: "Inverter battery", mode: "weight", weightText: "18.5", rateText: "105", fixedText: "" }],
      payments: [{ key: "p", mode: "upi", amountText: "1000", chargesText: "", chargesEdited: false }],
    });
    const input = toSaveInput(d, evaluate(d, DEFAULT_SETTINGS, "staff"));
    expect(input.customer).toEqual({ phone: "9876500001", name: "Sunil", area: "Chas", type: "retail" });
    expect(input.items[0]).toMatchObject({ unitId: "u2", serialNo: undefined });
    expect(input.items[1]).toMatchObject({ unitId: null, serialNo: "NEW-9" });
    expect(input.scrap[0]).toEqual({ batteryType: "Inverter battery", weightCentiKg: 1850, ratePerKg: 10_500 });
    expect(input.payments[0]).toEqual({ mode: "upi", towards: 100_000, charges: 0 });
  });
});

describe("warranty on a bill line", () => {
  const inverlast: CatalogProduct = { ...battery, id: "p-inv", hasSerial: false, needsRegistration: false, warrantyFreeMonths: 36, warrantyProrataMonths: 24 };
  const delivery: CatalogProduct = { ...trolley, id: "p-del", model: "Delivery", isService: true, warrantyFreeMonths: 0, warrantyProrataMonths: 0 };

  it("uses the product's warranty unless it was changed on the bill", () => {
    expect(lineWarranty(line(inverlast))).toEqual({ free: 36, prorata: 24 });
    expect(lineWarranty(line(inverlast, { warrantyFree: "24", warrantyProrata: "" }))).toEqual({ free: 24, prorata: 0 });
    expect(lineWarranty(line(inverlast, { warrantyFree: "abc", warrantyProrata: "24" }))).toBeNull();
    expect(lineWarranty(line(inverlast, { warrantyFree: "300", warrantyProrata: "0" }))).toBeNull();
    expect(lineWarranty(line(delivery, { warrantyFree: "12" }))).toEqual({ free: 0, prorata: 0 });
  });

  it("refuses a bill with unreadable warranty months, and sends what was shown", () => {
    const bad = draftWith({ lines: [line(inverlast, { warrantyFree: "x" })] });
    expect(keys(bad)).toContain("bad_warranty");
    const d = draftWith({
      lines: [line(inverlast, { warrantyFree: "12", warrantyProrata: "6" }), line(inverlast, { key: "b" }), line(delivery, { rateText: "300" })],
      payments: [{ key: "p1", mode: "cash", amountText: "29300", chargesText: "", chargesEdited: false }],
    });
    const ev = evaluate(d, DEFAULT_SETTINGS, "owner");
    const items = toSaveInput(d, ev).items;
    expect(items[0]).toMatchObject({ warrantyFreeMonths: 12, warrantyProrataMonths: 6 });
    expect(items[1]).toMatchObject({ warrantyFreeMonths: 36, warrantyProrataMonths: 24 });
    expect("warrantyFreeMonths" in items[2]).toBe(false);
  });
});

describe("GST on a bill (Regular GST)", () => {
  it("sends the business GSTIN and only marks 'no GST' when chosen", () => {
    const base = draftWith({
      customer: { id: null, phone: "9876500001", name: "Sunil", area: "", type: "retail", gstin: " 20aempk3613h1zw " },
      lines: [line(trolley)],
      payments: [{ key: "p1", mode: "cash", amountText: "800", chargesText: "", chargesEdited: false }],
    });
    const input = toSaveInput(base, evaluate(base, DEFAULT_SETTINGS, "staff"));
    expect(input.customer.gstin).toBe("20AEMPK3613H1ZW");
    expect("gst" in input).toBe(false);
    const noGst = { ...base, noGst: true };
    expect(toSaveInput(noGst, evaluate(noGst, DEFAULT_SETTINGS, "staff")).gst).toBe(false);
  });

  it("stops the bill when the GSTIN is wrong", () => {
    const d = draftWith({
      customer: { id: null, phone: "9876500001", name: "Sunil", area: "", type: "retail", gstin: "20AEMPK3613H1ZX" },
      lines: [line(trolley)],
    });
    expect(keys(d)).toContain("bad_gstin");
  });
});
