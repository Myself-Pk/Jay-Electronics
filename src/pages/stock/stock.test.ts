import { describe, expect, it } from "vitest";
import { PREVIEW_CATEGORIES } from "@/data/preview-store";
import type { CatalogProduct } from "@/data/types";
import { draftToProductInput, emptyProductDraft, productToDraft } from "./productForm";
import { emptyStockDraft, evaluateStock, splitSerials, toStockInput } from "./stockDraft";
import { matchCategory, parseCsv, readStockList } from "./stockImport";

const cats = PREVIEW_CATEGORIES;
const cat = (name: string) => cats.find((c) => c.name === name)!;

const battery: CatalogProduct = {
  id: "p1", brand: "Amaron", categoryId: cat("Inverter battery").id, category: "Inverter battery", categoryOrder: 1,
  gstRate: 1800, model: "Tall Tubular", capacity: "150Ah", type: "", mrp: 1_750_000, retailPrice: 1_450_000,
  dealerPrice: 1_360_000, minPrice: null, hasSerial: true, isService: false, warrantyFreeMonths: 48,
  warrantyProrataMonths: 24, needsRegistration: true, lowStockLevel: 2, inStock: 3, hsn: "8507",
};
const trolley: CatalogProduct = { ...battery, id: "p2", brand: null, categoryId: cat("Accessories").id, category: "Accessories",
  model: "Battery Trolley", capacity: "", mrp: null, retailPrice: 80_000, hasSerial: false, warrantyFreeMonths: 0, warrantyProrataMonths: 0 };

describe("product form", () => {
  it("turns what was typed into a product", () => {
    const d = { ...emptyProductDraft(cat("Inverter battery")), brand: " Exide ", model: "Tall Tubular", capacity: "150Ah",
      mrp: "17,000", retail: "14200", dealer: "13300", purchase: "12000", warrantyFree: "36", warrantyProrata: "24", lowStock: "2" };
    const r = draftToProductInput(d, cats, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toMatchObject({ brand: "Exide", mrp: 1_700_000, retailPrice: 1_420_000, purchasePrice: 1_200_000,
      hasSerial: true, warrantyFreeMonths: 36, lowStockLevel: 2 });
  });

  it("staff never send a purchase price", () => {
    const d = { ...productToDraft(battery, null), purchase: "1" };
    const r = draftToProductInput(d, cats, false);
    expect(r.ok && "purchasePrice" in r.input).toBe(false);
  });

  it("catches missing and wrong values", () => {
    const d = { ...emptyProductDraft(cat("Inverter battery")), mrp: "100", retail: "120", warrantyFree: "two" };
    const r = draftToProductInput(d, cats, true);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({ model: "validation.required", retail: "stock.importer.problems.aboveMrp", warrantyFree: "validation.months" });
  });

  it("services need no price and never have serials; opening stock only for count-based items", () => {
    const service = draftToProductInput({ ...emptyProductDraft(cat("Services")), model: "Repair", hasSerial: true }, cats, true);
    expect(service.ok && service.input.hasSerial).toBe(false);
    const water = draftToProductInput({ ...emptyProductDraft(cat("Accessories")), model: "Water", retail: "60", openingStock: "10" }, cats, true);
    expect(water.ok && water.input.openingStock).toBe(10);
    const bat = draftToProductInput({ ...emptyProductDraft(cat("Inverter battery")), model: "X", retail: "1", openingStock: "10" }, cats, true);
    expect(bat.ok && "openingStock" in bat.input).toBe(false);
  });
});

describe("stock list import", () => {
  it("reads CSV with quotes, commas inside quotes and Excel's BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("understands everyday category names", () => {
    const m = (t: string) => matchCategory(t, cats)?.name;
    expect(m("Inverter battery")).toBe("Inverter battery");
    expect(m("Automotive battery - car")).toBe("Automotive battery");
    expect(m("bike battery")).toBe("Automotive battery");
    expect(m("Inverter")).toBe("Inverter / UPS");
    expect(m("UPS")).toBe("Inverter / UPS");
    expect(m("Accessory")).toBe("Accessories");
    expect(m("Service")).toBe("Services");
    expect(m("Solar panel")).toBe("Solar panel");
    expect(m("Toys")).toBeUndefined();
  });

  it("reads the shop's template, skips example rows and reports problems", () => {
    const csv = [
      "Category,Brand,Model / Name,Capacity,Type,Has serial number (Y/N),MRP,Retail price,Dealer price,Purchase price,Warranty free months,Warranty pro-rata months,Current stock qty,Low stock alert at,Notes",
      "Inverter battery,Amaron,150Ah Tall Tubular,150Ah,Tall tubular,Y,,,,,,,,,EXAMPLE ROW - replace with real data",
      "Inverter battery,Exide,Tall Tubular,150Ah,,Y,17000,14200,13300,12000,36,24,4,2,",
      "Accessory,,Battery Trolley,,,N,,800,700,560,,,6,3,",
      "Toys,,Ball,,,,,10,,,,,,,",
      "Inverter battery,Amaron,Tall Tubular,150Ah,,,17500,abc,,,,,,,",
      'Accessory,,"Cable, 1m",,,N,,150,,,,,x,,',
    ].join("\n");
    const rows = readStockList(csv, cats, [battery]);
    expect(rows.map((r) => r.status)).toEqual(["skipped", "ready", "ready", "problem", "problem", "problem"]);
    expect(rows[1]).toMatchObject({ label: "Exide Tall Tubular 150Ah", needsSerialScan: true });
    expect(rows[1].input).toMatchObject({ retailPrice: 1_420_000, purchasePrice: 1_200_000, warrantyFreeMonths: 36, lowStockLevel: 2 });
    expect(rows[1].input && "openingStock" in rows[1].input).toBe(false);
    expect(rows[2].input).toMatchObject({ hasSerial: false, openingStock: 6 });
    expect(rows[3].problems).toEqual([{ key: "category", params: { value: "Toys" } }]);
    expect(rows[4].problems.map((p) => p.key)).toEqual(["price", "duplicate"]);
    expect(rows[5].problems).toEqual([{ key: "number", params: { value: "x" } }]);
  });
});

describe("new stock arrived", () => {
  const today = "2026-11-07";
  const line = (product: CatalogProduct, extra = {}) => ({ key: product.id, product, serials: [], qtyText: "", rateText: "", gstText: "", ...extra });

  it("splits scanned or pasted serials", () => {
    expect(splitSerials(" amr-1\namr-2, AMR-3 ")).toEqual(["AMR-1", "AMR-2", "AMR-3"]);
  });

  it("needs a distributor, serials, quantities and rates for a purchase", () => {
    const d = { ...emptyStockDraft(today), lines: [line(battery), line(trolley)] };
    expect(evaluateStock(d, today).problems.map((p) => p.key)).toEqual(["supplier", "serials", "rate", "qty", "rate"]);
  });

  it("opening stock needs no distributor or rate", () => {
    const d = { ...emptyStockDraft(today), kind: "opening_stock" as const, lines: [line(battery, { serials: ["A1", "A2"] }), line(trolley, { qtyText: "5" })] };
    const ev = evaluateStock(d, today);
    expect(ev.problems).toEqual([]);
    expect(ev.pieces).toBe(7);
    expect(toStockInput(d, ev).items).toEqual([
      { productId: "p1", qty: 2, rate: 0, gstPaid: 0, serials: ["A1", "A2"] },
      { productId: "p2", qty: 5, rate: 0, gstPaid: 0, serials: [] },
    ]);
  });

  it("adds up the bill: pieces × rate + GST", () => {
    const d = { ...emptyStockDraft(today), supplierName: "Shiv Shakti", lines: [line(battery, { serials: ["A1", "A2"], rateText: "10000", gstText: "3600" })] };
    const ev = evaluateStock(d, today);
    expect(ev.problems).toEqual([]);
    expect(ev.total).toBe(2_360_000);
  });

  it("refuses a future bill date", () => {
    const d = { ...emptyStockDraft(today), kind: "opening_stock" as const, billDate: "2026-11-08", lines: [line(trolley, { qtyText: "1" })] };
    expect(evaluateStock(d, today).problems.map((p) => p.key)).toEqual(["date"]);
  });
});
