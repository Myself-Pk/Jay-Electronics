/** The "New stock arrived" screen's working copy, its checks and totals. */
import { productLabel, type CatalogProduct, type StockEntryInput } from "@/data/types";
import { parseRupees, type Paise } from "@/lib/money";

export interface StockLine {
  key: string;
  product: CatalogProduct;
  serials: string[];
  qtyText: string;
  rateText: string;
  gstText: string;
}

export interface StockDraft {
  kind: "purchase" | "opening_stock";
  supplierName: string;
  billNo: string;
  billDate: string;
  lines: StockLine[];
}

export const emptyStockDraft = (today: string): StockDraft => ({
  kind: "purchase",
  supplierName: "",
  billNo: "",
  billDate: today,
  lines: [],
});

export interface StockProblem {
  key: string;
  params?: Record<string, string>;
}

export interface StockEvaluation {
  /** Pieces per line (serial count, or the typed quantity). */
  qty: number[];
  lineTotals: (Paise | null)[];
  pieces: number;
  total: Paise;
  problems: StockProblem[];
}

/** Split pasted or scanned text into serial numbers (one per line, or separated by spaces/commas). */
export function splitSerials(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function evaluateStock(d: StockDraft, today: string): StockEvaluation {
  const problems: StockProblem[] = [];
  if (d.lines.length === 0) problems.push({ key: "no_items" });
  if (d.kind === "purchase" && !d.supplierName.trim()) problems.push({ key: "supplier" });
  if (d.billDate > today) problems.push({ key: "date" });

  const qty: number[] = [];
  const lineTotals: (Paise | null)[] = [];
  for (const line of d.lines) {
    const product = productLabel(line.product);
    let n = line.serials.length;
    if (line.product.hasSerial) {
      if (n === 0) problems.push({ key: "serials", params: { product } });
    } else {
      n = /^\d+$/.test(line.qtyText.trim()) ? Number(line.qtyText) : 0;
      if (n <= 0) problems.push({ key: "qty", params: { product } });
    }
    qty.push(n);
    const rate = line.rateText.trim() ? parseRupees(line.rateText) : d.kind === "opening_stock" ? 0 : null;
    const gst = line.gstText.trim() ? parseRupees(line.gstText) : 0;
    if (rate === null || rate < 0 || (d.kind === "purchase" && rate === 0) || gst === null || gst < 0) {
      problems.push({ key: "rate", params: { product } });
      lineTotals.push(null);
    } else {
      lineTotals.push(n * rate + gst);
    }
  }
  return {
    qty,
    lineTotals,
    pieces: qty.reduce((a, b) => a + b, 0),
    total: lineTotals.reduce<number>((a, b) => a + (b ?? 0), 0),
    problems,
  };
}

/** Only call when evaluateStock found no problems. */
export function toStockInput(d: StockDraft, ev: StockEvaluation): StockEntryInput {
  return {
    kind: d.kind,
    supplierName: d.kind === "purchase" ? d.supplierName.trim() : "",
    supplierBillNo: d.billNo.trim(),
    billDate: d.billDate,
    items: d.lines.map((l, i) => ({
      productId: l.product.id,
      qty: ev.qty[i],
      rate: l.rateText.trim() ? parseRupees(l.rateText)! : 0,
      gstPaid: l.gstText.trim() ? parseRupees(l.gstText)! : 0,
      serials: l.product.hasSerial ? l.serials : [],
    })),
  };
}
