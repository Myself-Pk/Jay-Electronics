/**
 * GST return figures (Regular GST) from the bills of a period — what goes into GSTR-1
 * (B2B invoices, B2C summary, HSN summary, documents issued) and GSTR-3B (3.1(a) outward
 * taxable supplies, 3.2 inter-state supplies to unregistered persons).
 *
 * Prices are GST-inclusive. Tax Invoices use the GST stored on each line. Bills made without
 * GST on purpose — and bills printed as "Bill of Supply" before the switch to Tax Invoices (the
 * shop has always been a Regular dealer) — still owe GST, so their tax is worked out the same
 * way at the product's rate and included.
 * Cancelled bills are left out of the values but counted in "documents issued".
 * All money in whole paise.
 */
import { CHARGES_GST_RATE, gstInside, splitCgstSgst } from "./billMath";
import type { BasisPoints, Paise } from "./money";

export interface GstLine {
  hsn: string;
  description: string;
  qty: number;
  /** GST-inclusive amount of the line */
  amount: Paise;
  /** Rate and GST stored on the bill line (0 on bills made without GST) */
  gstRate: BasisPoints;
  gstAmount: Paise;
  /** The product's GST rate, used for bills made without GST */
  productGstRate: BasisPoints;
  isService: boolean;
}

export interface GstBill {
  number: string;
  /** yyyy-mm-dd */
  date: string;
  status: "saved" | "cancelled";
  title: "tax_invoice" | "bill" | "bill_of_supply";
  customerName: string;
  customerGstin: string | null;
  /** State code, e.g. "20" */
  placeOfSupply: string;
  total: Paise;
  /** Card / Bajaj charges (GST at 18% inside them) */
  extraCharges: Paise;
  items: GstLine[];
}

export interface TaxSplit {
  taxable: Paise;
  igst: Paise;
  cgst: Paise;
  sgst: Paise;
}

export interface B2bRow extends TaxSplit {
  gstin: string;
  name: string;
  number: string;
  date: string;
  /** Whole invoice value */
  value: Paise;
  pos: string;
  rate: BasisPoints;
}

export interface B2csRow extends TaxSplit {
  pos: string;
  rate: BasisPoints;
}

export interface HsnRow extends TaxSplit {
  hsn: string;
  description: string;
  /** "NOS" for goods, "OTH" for services and charges */
  uqc: string;
  qty: number;
  rate: BasisPoints;
  /** GST-inclusive value */
  value: Paise;
}

export interface GstReturn {
  counts: { taxInvoices: number; withoutGst: number; cancelled: number; composition: number };
  /** Documents issued (GSTR-1 table 13): bill numbers in the period, cancelled included */
  documents: { first: string | null; last: string | null; total: number; cancelled: number };
  /** GSTR-3B 3.1(a) */
  outward: TaxSplit;
  b2b: B2bRow[];
  b2cs: B2csRow[];
  hsnB2b: HsnRow[];
  hsnB2c: HsnRow[];
  /** GSTR-3B 3.2: inter-state supplies to unregistered persons, by place of supply */
  interStateUnregistered: { pos: string; taxable: Paise; igst: Paise }[];
  /** Bills made without GST (their GST is included in the figures above) */
  withoutGst: { count: number; value: Paise; tax: Paise };
}

const ZERO: TaxSplit = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };

function splitTax(gst: Paise, inter: boolean): Omit<TaxSplit, "taxable"> {
  if (inter) return { igst: gst, cgst: 0, sgst: 0 };
  const { cgst, sgst } = splitCgstSgst(gst);
  return { igst: 0, cgst, sgst };
}

function addTo<T extends TaxSplit>(row: T, taxable: Paise, tax: Omit<TaxSplit, "taxable">): void {
  row.taxable += taxable;
  row.igst += tax.igst;
  row.cgst += tax.cgst;
  row.sgst += tax.sgst;
}

/** Each taxed piece of a bill: its lines, plus card / Bajaj charges as a line of their own. */
function taxedLines(bill: GstBill): { line: GstLine; rate: BasisPoints; gst: Paise }[] {
  const withGst = bill.title === "tax_invoice";
  const out = bill.items.map((line) => {
    const rate = withGst ? line.gstRate : line.productGstRate;
    const gst = withGst ? line.gstAmount : gstInside(line.amount, rate);
    return { line, rate, gst };
  });
  if (bill.extraCharges > 0) {
    out.push({
      line: {
        hsn: "",
        description: "Card / finance charges",
        qty: 1,
        amount: bill.extraCharges,
        gstRate: CHARGES_GST_RATE,
        gstAmount: 0,
        productGstRate: CHARGES_GST_RATE,
        isService: true,
      },
      rate: CHARGES_GST_RATE,
      gst: gstInside(bill.extraCharges, CHARGES_GST_RATE),
    });
  }
  return out.filter((x) => x.rate > 0);
}

export function gstReturn(bills: GstBill[], shopState: string): GstReturn {
  const counts = { taxInvoices: 0, withoutGst: 0, cancelled: 0, composition: 0 };
  const outward: TaxSplit = { ...ZERO };
  const b2b = new Map<string, B2bRow>();
  const b2cs = new Map<string, B2csRow>();
  const hsnB2b = new Map<string, HsnRow>();
  const hsnB2c = new Map<string, HsnRow>();
  const withoutGst = { count: 0, value: 0, tax: 0 };

  const numbered = [...bills].sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
  const documents = {
    first: numbered[0]?.number ?? null,
    last: numbered[numbered.length - 1]?.number ?? null,
    total: numbered.length,
    cancelled: numbered.filter((b) => b.status === "cancelled").length,
  };

  for (const bill of bills) {
    if (bill.status === "cancelled") {
      counts.cancelled++;
      continue;
    }
    // The shop is a Regular dealer, so bills printed as "Bill of Supply" before the switch to
    // Tax Invoices still owe GST: counted like bills made without GST (and noted separately).
    if (bill.title === "bill_of_supply") counts.composition++;
    if (bill.title === "tax_invoice") counts.taxInvoices++;
    else counts.withoutGst++;

    const inter = bill.placeOfSupply !== shopState;
    const registered = !!bill.customerGstin;
    let billTax = 0;
    for (const { line, rate, gst } of taxedLines(bill)) {
      const taxable = line.amount - gst;
      const tax = splitTax(gst, inter);
      billTax += gst;
      addTo(outward, taxable, tax);

      if (registered) {
        const key = `${bill.number}|${rate}`;
        const row = b2b.get(key) ?? {
          gstin: bill.customerGstin!, name: bill.customerName, number: bill.number, date: bill.date,
          value: bill.total, pos: bill.placeOfSupply, rate, ...ZERO,
        };
        addTo(row, taxable, tax);
        b2b.set(key, row);
      } else {
        const key = `${bill.placeOfSupply}|${rate}`;
        const row = b2cs.get(key) ?? { pos: bill.placeOfSupply, rate, ...ZERO };
        addTo(row, taxable, tax);
        b2cs.set(key, row);
      }

      const hsnMap = registered ? hsnB2b : hsnB2c;
      const hsn = line.hsn || "—";
      const hkey = `${hsn}|${rate}`;
      const h = hsnMap.get(hkey) ?? {
        hsn, description: line.description, uqc: line.isService ? "OTH" : "NOS", qty: 0, rate, value: 0, ...ZERO,
      };
      h.qty += line.qty;
      h.value += line.amount;
      addTo(h, taxable, tax);
      hsnMap.set(hkey, h);
    }
    if (bill.title !== "tax_invoice") {
      withoutGst.count++;
      withoutGst.value += bill.total;
      withoutGst.tax += billTax;
    }
  }

  const b2csRows = [...b2cs.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate);
  const interMap = new Map<string, { pos: string; taxable: Paise; igst: Paise }>();
  for (const r of b2csRows) {
    if (r.pos === shopState) continue;
    const row = interMap.get(r.pos) ?? { pos: r.pos, taxable: 0, igst: 0 };
    row.taxable += r.taxable;
    row.igst += r.igst;
    interMap.set(r.pos, row);
  }
  const byHsn = (a: HsnRow, b: HsnRow) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate;

  return {
    counts,
    documents,
    outward,
    b2b: [...b2b.values()].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, "en", { numeric: true })),
    b2cs: b2csRows,
    hsnB2b: [...hsnB2b.values()].sort(byHsn),
    hsnB2c: [...hsnB2c.values()].sort(byHsn),
    interStateUnregistered: [...interMap.values()],
    withoutGst,
  };
}

const rupees = (p: Paise) => (p / 100).toFixed(2);
const pct = (bp: BasisPoints) => String(bp / 100);
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number)[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** GSTR-1 sheets as Excel-ready CSV, in the columns of the GST offline tool. */
export function gstr1Csv(ret: GstReturn, stateName: (code: string) => string) {
  const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("-");
  const hsnSheet = (rows: HsnRow[]) =>
    toCsv([
      ["HSN", "Description", "UQC", "Total Quantity", "Total Value", "Rate", "Taxable Value", "Integrated Tax Amount", "Central Tax Amount", "State/UT Tax Amount", "Cess Amount"],
      ...rows.map((r) => [r.hsn, r.description, r.uqc, r.qty, rupees(r.value), pct(r.rate), rupees(r.taxable), rupees(r.igst), rupees(r.cgst), rupees(r.sgst), "0.00"]),
    ]);
  return {
    b2b: toCsv([
      ["GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Reverse Charge", "Invoice Type", "Rate", "Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax"],
      ...ret.b2b.map((r) => [r.gstin, r.name, r.number, ddmmyyyy(r.date), rupees(r.value), stateName(r.pos), "N", "Regular B2B", pct(r.rate), rupees(r.taxable), rupees(r.igst), rupees(r.cgst), rupees(r.sgst)]),
    ]),
    b2cs: toCsv([
      ["Type", "Place Of Supply", "Rate", "Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax"],
      ...ret.b2cs.map((r) => ["OE", stateName(r.pos), pct(r.rate), rupees(r.taxable), rupees(r.igst), rupees(r.cgst), rupees(r.sgst)]),
    ]),
    hsnB2b: hsnSheet(ret.hsnB2b),
    hsnB2c: hsnSheet(ret.hsnB2c),
  };
}
