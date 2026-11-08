import { describe, expect, it } from "vitest";
import {
  billsCsv,
  buildReport,
  byMonth,
  COMPOSITION_LIMIT,
  compositionTax,
  datesBetween,
  expectedCash,
  OTHER,
  presetRange,
  quarterOf,
  type ReportBill,
  type ReportInput,
} from "./report";

const item = (o: Partial<ReportBill["items"][number]> = {}) => ({
  description: "Amaron 150Ah",
  qty: 1,
  amount: 14_500_00,
  brand: "Amaron",
  category: "Inverter battery",
  isService: false,
  unitCost: 12_000_00,
  ...o,
});

const bill = (o: Partial<ReportBill> = {}): ReportBill => ({
  id: Math.random().toString(36),
  number: "JE/26-27/0001",
  date: "2026-11-08",
  customerName: "Sunil",
  customerPhone: "9876500001",
  total: 14_500_00,
  balance: 0,
  scrapCredit: 0,
  status: "saved",
  items: [item()],
  ...o,
});

const base: ReportInput = { from: "2026-11-08", to: "2026-11-08", bills: [], payments: [], expenses: [], scrap: [], withProfit: true };

describe("buildReport", () => {
  it("adds up sales, udhaar given and udhaar collected", () => {
    const r = buildReport({
      ...base,
      bills: [
        bill({ id: "a", total: 14_500_00, balance: 4_500_00 }),
        bill({ id: "b", total: 800_00, items: [item({ description: "Trolley", brand: null, amount: 800_00, unitCost: 600_00 })] }),
        bill({ id: "c", total: 999_00, status: "cancelled" }),
        bill({ id: "d", date: "2026-11-07", total: 5_000_00 }), // outside the dates
      ],
      payments: [
        { date: "2026-11-08", direction: "in", mode: "cash", amount: 10_000_00, billDate: "2026-11-08" },
        { date: "2026-11-08", direction: "in", mode: "upi", amount: 800_00, billDate: "2026-11-08" },
        { date: "2026-11-08", direction: "in", mode: "cash", amount: 2_000_00, billDate: "2026-10-01" }, // old udhaar
        { date: "2026-11-07", direction: "in", mode: "cash", amount: 5_000_00, billDate: "2026-11-07" },
      ],
    });
    expect(r.sales).toBe(15_300_00);
    expect(r.billCount).toBe(2);
    expect(r.averageBill).toBe(7_650_00);
    expect(r.cancelledCount).toBe(1);
    expect(r.cancelledAmount).toBe(999_00);
    expect(r.udhaarGiven).toBe(4_500_00);
    expect(r.udhaarCollected).toBe(2_000_00);
    expect(r.moneyIn).toEqual([
      { mode: "cash", amount: 12_000_00 },
      { mode: "upi", amount: 800_00 },
    ]);
    expect(r.moneyInTotal).toBe(12_800_00);
    expect(r.profit).toBe(2_500_00 + 200_00);
    expect(r.byBrand.map((b) => b.name)).toEqual(["Amaron", OTHER]);
    expect(r.days).toEqual([{ date: "2026-11-08", total: 15_300_00, bills: 2 }]);
  });

  it("hides profit from staff and leaves services out of brands and top products", () => {
    const r = buildReport({
      ...base,
      withProfit: false,
      bills: [bill({ items: [item(), item({ description: "Delivery", isService: true, brand: null, category: "Services", amount: 300_00, unitCost: null })] })],
    });
    expect(r.profit).toBeNull();
    expect(r.serviceSales).toBe(300_00);
    expect(r.topProducts.map((p) => p.name)).toEqual(["Amaron 150Ah"]);
    expect(r.byCategory.map((c) => c.name)).toEqual(["Inverter battery", "Services"]);
  });

  it("counts expenses (not cancelled ones), refunds and scrap, and works out the cash in the drawer", () => {
    const r = buildReport({
      ...base,
      payments: [
        { date: "2026-11-08", direction: "in", mode: "cash", amount: 5_000_00, billDate: "2026-11-08" },
        { date: "2026-11-08", direction: "in", mode: "bajaj", amount: 10_000_00, billDate: "2026-11-08" },
        { date: "2026-11-08", direction: "out", mode: "cash", amount: 500_00, billDate: "2026-11-01" },
      ],
      expenses: [
        { id: "1", date: "2026-11-08", category: "Tea & snacks", amount: 120_00, mode: "cash", note: "", status: "saved" },
        { id: "2", date: "2026-11-08", category: "Transport", amount: 300_00, mode: "upi", note: "", status: "saved" },
        { id: "3", date: "2026-11-08", category: "Transport", amount: 999_00, mode: "cash", note: "", status: "cancelled" },
      ],
      scrap: [
        { date: "2026-11-08", centiKg: 1850, value: 1_942_50 },
        { date: "2026-11-08", centiKg: null, value: 1_000_00 },
      ],
    });
    expect(r.expensesTotal).toBe(420_00);
    expect(r.expensesByCategory).toEqual([
      { name: "Transport", amount: 300_00 },
      { name: "Tea & snacks", amount: 120_00 },
    ]);
    expect(r.moneyIn.map((m) => m.mode)).toEqual(["cash", "bajaj"]);
    expect(r.moneyOutTotal).toBe(500_00);
    expect(r.cash).toEqual({ in: 5_000_00, out: 500_00, expenses: 120_00 });
    expect(expectedCash(2_000_00, r.cash)).toBe(2_000_00 + 5_000_00 - 500_00 - 120_00);
    expect(r.scrapCentiKg).toBe(1850);
    expect(r.scrapValue).toBe(2_942_50);
  });
});

describe("dates and GST helpers", () => {
  it("lists every day in a range, across months", () => {
    expect(datesBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesBetween("2026-11-08", "2026-11-08")).toEqual(["2026-11-08"]);
  });

  it("finds the GST quarter and its CMP-08 due date", () => {
    expect(quarterOf("2026-11-08")).toEqual({ from: "2026-10-01", to: "2026-12-31", label: "Q3", due: "2027-01-18" });
    expect(quarterOf("2027-02-10")).toEqual({ from: "2027-01-01", to: "2027-03-31", label: "Q4", due: "2027-04-18" });
    expect(quarterOf("2026-04-01")).toEqual({ from: "2026-04-01", to: "2026-06-30", label: "Q1", due: "2026-07-18" });
    expect(quarterOf("2026-09-30")).toEqual({ from: "2026-07-01", to: "2026-09-30", label: "Q2", due: "2026-10-18" });
  });

  it("works out composition tax on sales before the old-battery discount", () => {
    const r = compositionTax(
      [bill({ total: 12_557_50, scrapCredit: 1_942_50 }), bill({ total: 50_000_00, status: "cancelled" })],
      100,
    );
    expect(r.turnover).toBe(14_500_00);
    expect(r.tax).toBe(145_00);
    expect(COMPOSITION_LIMIT).toBe(15_000_000_00);
  });

  it("knows the dates behind each quick choice", () => {
    const today = "2026-11-08"; // a Sunday
    expect(presetRange("today", today)).toEqual({ from: today, to: today });
    expect(presetRange("yesterday", today)).toEqual({ from: "2026-11-07", to: "2026-11-07" });
    expect(presetRange("week", today)).toEqual({ from: "2026-11-02", to: today });
    expect(presetRange("week", "2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-02" });
    expect(presetRange("month", today)).toEqual({ from: "2026-11-01", to: today });
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("lastMonth", "2027-01-15")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("lastMonth", "2027-03-31")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(presetRange("quarter", today)).toEqual({ from: "2026-10-01", to: today });
    expect(presetRange("year", today)).toEqual({ from: "2026-04-01", to: today });
    expect(presetRange("year", "2027-02-01")).toEqual({ from: "2026-04-01", to: "2027-02-01" });
    expect(presetRange("yesterday", "2027-01-01")).toEqual({ from: "2026-12-31", to: "2026-12-31" });
  });

  it("adds up days into months for long ranges", () => {
    expect(
      byMonth([
        { date: "2026-10-31", total: 100, bills: 1 },
        { date: "2026-11-01", total: 200, bills: 2 },
        { date: "2026-11-02", total: 300, bills: 1 },
      ]),
    ).toEqual([
      { date: "2026-10-01", total: 100, bills: 1 },
      { date: "2026-11-01", total: 500, bills: 3 },
    ]);
  });

  it("exports bills for Excel", () => {
    const csv = billsCsv(
      [bill({ number: "JE/26-27/0002", customerName: 'Rakesh "Raju", Chas', total: 800_00, balance: 300_00 })],
      ["Bill no", "Date", "Customer", "Phone", "Total", "Paid", "Udhaar", "Status"],
      (s) => (s === "saved" ? "Saved" : "Cancelled"),
    );
    expect(csv.startsWith("﻿Bill no,")).toBe(true);
    expect(csv).toContain('JE/26-27/0002,2026-11-08,"Rakesh ""Raju"", Chas",9876500001,800.00,500.00,300.00,Saved\r\n');
  });
});
