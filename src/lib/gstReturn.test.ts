import { describe, expect, it } from "vitest";
import { gstInside } from "./billMath";
import { gstr1Csv, gstReturn, type GstBill, type GstLine } from "./gstReturn";

const line = (o: Partial<GstLine> = {}): GstLine => ({
  hsn: "8507",
  description: "Luminous Inverlast 220Ah",
  qty: 1,
  amount: 1_990_000,
  gstRate: 1800,
  gstAmount: 303_559,
  productGstRate: 1800,
  isService: false,
  ...o,
});

const bill = (o: Partial<GstBill> = {}): GstBill => ({
  number: "JE/26-27/0002",
  date: "2026-11-25",
  status: "saved",
  title: "tax_invoice",
  customerName: "Sunil",
  customerGstin: null,
  placeOfSupply: "20",
  total: 1_990_000,
  extraCharges: 0,
  items: [line()],
  ...o,
});

describe("gstReturn", () => {
  it("adds up a retail Tax Invoice as B2C, split into CGST + SGST", () => {
    const r = gstReturn([bill()], "20");
    expect(r.outward).toEqual({ taxable: 1_686_441, igst: 0, cgst: 151_780, sgst: 151_779 });
    expect(r.b2cs).toEqual([{ pos: "20", rate: 1800, taxable: 1_686_441, igst: 0, cgst: 151_780, sgst: 151_779 }]);
    expect(r.b2b).toEqual([]);
    expect(r.hsnB2c[0]).toMatchObject({ hsn: "8507", uqc: "NOS", qty: 1, value: 1_990_000, taxable: 1_686_441 });
    expect(r.counts).toEqual({ taxInvoices: 1, withoutGst: 0, cancelled: 0, composition: 0 });
  });

  it("puts a business customer in B2B, and another state as IGST", () => {
    const r = gstReturn([bill({ customerGstin: "10ABCDE1234F1Z5", customerName: "Biz Co", placeOfSupply: "10" })], "20");
    expect(r.b2b).toEqual([
      { gstin: "10ABCDE1234F1Z5", name: "Biz Co", number: "JE/26-27/0002", date: "2026-11-25", value: 1_990_000, pos: "10", rate: 1800,
        taxable: 1_686_441, igst: 303_559, cgst: 0, sgst: 0 },
    ]);
    expect(r.hsnB2b).toHaveLength(1);
    expect(r.hsnB2c).toHaveLength(0);
    expect(r.interStateUnregistered).toEqual([]); // registered buyers aren't in 3.2
  });

  it("counts GST on bills made without GST and old Bills of Supply; leaves out cancelled bills", () => {
    const r = gstReturn(
      [
        bill({ number: "JE/26-27/0003", title: "bill", items: [line({ gstRate: 0, gstAmount: 0 })] }),
        bill({ number: "JE/26-27/0004", status: "cancelled" }),
        bill({ number: "JE/26-27/0001", title: "bill_of_supply", items: [line({ gstRate: 0, gstAmount: 0 })] }),
      ],
      "20",
    );
    expect(r.withoutGst).toEqual({ count: 2, value: 2 * 1_990_000, tax: 2 * 303_559 });
    expect(r.outward.taxable).toBe(2 * 1_686_441);
    expect(r.counts).toEqual({ taxInvoices: 0, withoutGst: 2, cancelled: 1, composition: 1 });
    expect(r.documents).toEqual({ first: "JE/26-27/0001", last: "JE/26-27/0004", total: 3, cancelled: 1 });
  });

  it("adds card charges at 18% and keeps rates apart; unregistered other-state sales go to 3.2", () => {
    const panel = line({ hsn: "8541", description: "Exide Solar Panel 200W", amount: 640_000, gstRate: 500, gstAmount: gstInside(640_000, 500) });
    const r = gstReturn([bill({ placeOfSupply: "19", items: [line(), panel], extraCharges: 1_200, total: 2_631_200 })], "20");
    expect(r.b2cs.map((x) => x.rate)).toEqual([500, 1800]);
    const eighteen = r.b2cs.find((x) => x.rate === 1800)!;
    expect(eighteen.igst).toBe(303_559 + 183);
    expect(r.interStateUnregistered).toEqual([{ pos: "19", taxable: r.outward.taxable, igst: r.outward.igst }]);
    expect(r.hsnB2c.map((h) => `${h.hsn}:${h.uqc}`)).toEqual(["—:OTH", "8507:NOS", "8541:NOS"]);
  });

  it("keeps tax-free lines (Delivery & installation) out of taxable figures, as nil / exempt", () => {
    const delivery = line({ hsn: "", description: "Delivery & installation", amount: 30_000, gstRate: 0, gstAmount: 0, productGstRate: 0, isService: true });
    const r = gstReturn(
      [bill({ items: [line(), delivery], total: 2_020_000 }), bill({ number: "JE/26-27/0005", customerGstin: "10ABCDE1234F1Z5", placeOfSupply: "10", items: [delivery], total: 30_000 })],
      "20",
    );
    expect(r.exempt).toEqual({ intraRegistered: 0, intraUnregistered: 30_000, interRegistered: 30_000, interUnregistered: 0, total: 60_000 });
    expect(r.outward.taxable).toBe(1_686_441);
    expect(r.hsnB2c.map((h) => h.hsn)).toEqual(["8507"]);
    expect(r.b2b).toEqual([]);
  });

  it("writes GSTR-1 sheets for Excel", () => {
    const r = gstReturn([bill({ customerGstin: "20AEMPK3613H1ZW", customerName: 'Shop "A", Chas' })], "20");
    const csv = gstr1Csv(r, (c) => (c === "20" ? "20-Jharkhand" : c));
    expect(csv.b2b).toContain('20AEMPK3613H1ZW,"Shop ""A"", Chas",JE/26-27/0002,25-11-2026,19900.00,20-Jharkhand,N,Regular B2B,18,16864.41,0.00,1517.80,1517.79');
    expect(csv.hsnB2b.split("\r\n")[1]).toBe("8507,Luminous Inverlast 220Ah,NOS,1,19900.00,18,16864.41,0.00,1517.80,1517.79,0.00");
  });
});
