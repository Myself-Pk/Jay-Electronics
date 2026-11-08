/**
 * Sales reports and the Close Day summary, worked out from plain rows.
 * The same function is used for the live database and for Preview mode,
 * so both always add up the same way. All money is in whole paise.
 */
import { percentOf, type BasisPoints, type Paise } from "./money";

export type Mode = "cash" | "upi" | "debit_card" | "credit_card" | "bajaj" | "bank";

export interface ReportItem {
  description: string;
  qty: number;
  amount: Paise;
  brand: string | null;
  category: string | null;
  isService: boolean;
  /** Purchase cost per piece; null when not known or not allowed (staff). */
  unitCost: Paise | null;
}

export interface ReportBill {
  id: string;
  number: string;
  /** yyyy-mm-dd */
  date: string;
  customerName: string;
  customerPhone: string;
  total: Paise;
  balance: Paise;
  scrapCredit: Paise;
  status: "saved" | "cancelled";
  items: ReportItem[];
}

export interface ReportPayment {
  /** yyyy-mm-dd the money was received or given back */
  date: string;
  direction: "in" | "out";
  mode: Mode;
  amount: Paise;
  /** Date of the bill this payment belongs to, if any. */
  billDate: string | null;
}

export interface ReportExpense {
  id: string;
  date: string;
  category: string;
  amount: Paise;
  mode: Mode;
  note: string;
  status: "saved" | "cancelled";
}

export interface ReportScrap {
  date: string;
  /** Weight in hundredths of a kg (18.5 kg = 1850); null for a fixed amount. */
  centiKg: number | null;
  value: Paise;
}

export interface ReportInput {
  from: string;
  to: string;
  bills: ReportBill[];
  payments: ReportPayment[];
  expenses: ReportExpense[];
  scrap: ReportScrap[];
  /** True when purchase costs are visible (owner), so profit can be shown. */
  withProfit: boolean;
}

export interface Breakdown {
  name: string;
  qty: number;
  amount: Paise;
}

export interface Report {
  from: string;
  to: string;
  sales: Paise;
  billCount: number;
  averageBill: Paise;
  cancelledCount: number;
  cancelledAmount: Paise;
  /** Part of these bills not paid on the day they were made. */
  udhaarGiven: Paise;
  /** Old udhaar paid during these dates. */
  udhaarCollected: Paise;
  /** Money received during these dates, by mode (Bajaj = loan, paid later by Bajaj). */
  moneyIn: { mode: Mode; amount: Paise }[];
  moneyInTotal: Paise;
  moneyOut: { mode: Mode; amount: Paise }[];
  moneyOutTotal: Paise;
  expensesTotal: Paise;
  expensesByCategory: { name: string; amount: Paise }[];
  expenses: ReportExpense[];
  scrapCentiKg: number;
  scrapValue: Paise;
  serviceSales: Paise;
  byBrand: Breakdown[];
  byCategory: Breakdown[];
  topProducts: Breakdown[];
  /** Sales minus purchase cost (owner only). */
  profit: Paise | null;
  /** Sales per day, oldest first. */
  days: { date: string; total: Paise; bills: number }[];
  /** Cash movements, for the cash check. */
  cash: { in: Paise; out: Paise; expenses: Paise };
}

const MODE_ORDER: Mode[] = ["cash", "upi", "debit_card", "credit_card", "bank", "bajaj"];

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

function byMode(rows: { mode: Mode; amount: Paise }[]) {
  const sums = new Map<Mode, Paise>();
  for (const r of rows) sums.set(r.mode, (sums.get(r.mode) ?? 0) + r.amount);
  return MODE_ORDER.filter((m) => sums.has(m)).map((mode) => ({ mode, amount: sums.get(mode)! }));
}

function group(items: ReportItem[], key: (i: ReportItem) => string): Breakdown[] {
  const sums = new Map<string, Breakdown>();
  for (const i of items) {
    const name = key(i);
    const g = sums.get(name) ?? { name, qty: 0, amount: 0 };
    g.qty += i.qty;
    g.amount += i.amount;
    sums.set(name, g);
  }
  return [...sums.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

/** Every date from `from` to `to` (inclusive), as yyyy-mm-dd. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  for (let day = new Date(Date.UTC(y, m - 1, d)); ; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    if (iso > to || out.length > 400) break;
    out.push(iso);
  }
  return out;
}

export const OTHER = "__other__";

export function buildReport(input: ReportInput): Report {
  const { from, to } = input;
  const bills = input.bills.filter((b) => inRange(b.date, from, to));
  const saved = bills.filter((b) => b.status === "saved");
  const cancelled = bills.filter((b) => b.status === "cancelled");
  const payments = input.payments.filter((p) => inRange(p.date, from, to));
  const paymentsIn = payments.filter((p) => p.direction === "in");
  const paymentsOut = payments.filter((p) => p.direction === "out");
  const expenses = input.expenses.filter((e) => e.status === "saved" && inRange(e.date, from, to));
  const scrap = input.scrap.filter((s) => inRange(s.date, from, to));
  const items = saved.flatMap((b) => b.items);
  const goods = items.filter((i) => !i.isService);

  const sales = saved.reduce((s, b) => s + b.total, 0);
  // Paid on the bill's own day (cash, UPI, cards, Bajaj loan) — the rest went on udhaar.
  const paidOnBillDay = paymentsIn
    .filter((p) => p.billDate !== null && p.billDate === p.date)
    .reduce((s, p) => s + p.amount, 0);
  const udhaarCollected = paymentsIn
    .filter((p) => p.billDate !== null && p.billDate < p.date)
    .reduce((s, p) => s + p.amount, 0);

  const expenseGroups = new Map<string, Paise>();
  for (const e of expenses) expenseGroups.set(e.category, (expenseGroups.get(e.category) ?? 0) + e.amount);

  const profit = input.withProfit
    ? items.reduce((s, i) => s + i.amount - (i.unitCost === null ? 0 : Math.round(i.qty * i.unitCost)), 0)
    : null;

  const moneyIn = byMode(paymentsIn);
  const moneyOut = byMode(paymentsOut);
  const cashOf = (rows: { mode: Mode; amount: Paise }[]) => rows.filter((r) => r.mode === "cash").reduce((s, r) => s + r.amount, 0);

  return {
    from,
    to,
    sales,
    billCount: saved.length,
    averageBill: saved.length ? Math.round(sales / saved.length) : 0,
    cancelledCount: cancelled.length,
    cancelledAmount: cancelled.reduce((s, b) => s + b.total, 0),
    udhaarGiven: Math.max(0, sales - paidOnBillDay),
    udhaarCollected,
    moneyIn,
    moneyInTotal: paymentsIn.reduce((s, p) => s + p.amount, 0),
    moneyOut,
    moneyOutTotal: paymentsOut.reduce((s, p) => s + p.amount, 0),
    expensesTotal: expenses.reduce((s, e) => s + e.amount, 0),
    expensesByCategory: [...expenseGroups].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
    expenses,
    scrapCentiKg: scrap.reduce((s, x) => s + (x.centiKg ?? 0), 0),
    scrapValue: scrap.reduce((s, x) => s + x.value, 0),
    serviceSales: items.filter((i) => i.isService).reduce((s, i) => s + i.amount, 0),
    byBrand: group(goods, (i) => i.brand || OTHER),
    byCategory: group(items, (i) => i.category || OTHER),
    topProducts: group(goods, (i) => i.description).slice(0, 10),
    profit,
    days: datesBetween(from, to).map((date) => {
      const list = saved.filter((b) => b.date === date);
      return { date, total: list.reduce((s, b) => s + b.total, 0), bills: list.length };
    }),
    cash: { in: cashOf(paymentsIn), out: cashOf(paymentsOut), expenses: cashOf(expenses) },
  };
}

/** Cash the drawer should hold: start + cash in - cash given back - cash expenses. */
export function expectedCash(opening: Paise, cash: Report["cash"]): Paise {
  return opening + cash.in - cash.out - cash.expenses;
}

/**
 * Composition GST helper. Sales are counted before the old-battery discount
 * (buying a customer's old battery is a separate purchase, not a price cut).
 */
export function compositionTax(bills: Pick<ReportBill, "total" | "scrapCredit" | "status">[], rate: BasisPoints) {
  const turnover = bills.filter((b) => b.status === "saved").reduce((s, b) => s + b.total + b.scrapCredit, 0);
  return { turnover, tax: percentOf(turnover, rate) };
}

/** ₹1.5 crore: above this a shop must leave the Composition scheme. */
export const COMPOSITION_LIMIT: Paise = 1_50_00_000_00;

/** Indian financial-year quarter (Apr–Jun = 1 … Jan–Mar = 4) containing a date, with its CMP-08 due date. */
export function quarterOf(iso: string): { from: string; to: string; label: string; due: string } {
  const [y, m] = iso.split("-").map(Number);
  const q = m >= 4 ? Math.floor((m - 4) / 3) : 3; // 0..3
  const startMonth = [4, 7, 10, 1][q];
  const year = y; // a quarter never crosses a calendar year
  const endMonth = startMonth + 2;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dueMonth = endMonth + 1 > 12 ? 1 : endMonth + 1;
  const dueYear = endMonth + 1 > 12 ? year + 1 : year;
  return {
    from: `${year}-${pad(startMonth)}-01`,
    to: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
    label: `Q${q + 1}`,
    due: `${dueYear}-${pad(dueMonth)}-18`,
  };
}

export const RANGE_KEYS = ["today", "yesterday", "week", "month", "lastMonth", "quarter", "year"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

const isoUTC = (d: Date) => d.toISOString().slice(0, 10);

/** The dates behind each quick choice on the Reports screen. Weeks start on Monday; years on 1 April. */
export function presetRange(key: RangeKey, today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const at = (yy: number, mm: number, dd: number) => isoUTC(new Date(Date.UTC(yy, mm - 1, dd)));
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const v = at(y, m, d - 1);
      return { from: v, to: v };
    }
    case "week": {
      const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
      return { from: at(y, m, d - weekday), to: today };
    }
    case "month":
      return { from: at(y, m, 1), to: today };
    case "lastMonth":
      return { from: at(y, m - 1, 1), to: at(y, m, 0) };
    case "quarter":
      return { from: quarterOf(today).from, to: today };
    case "year":
      return { from: at(m >= 4 ? y : y - 1, 4, 1), to: today };
  }
}

/** Sales per calendar month (for long date ranges), oldest first. */
export function byMonth(days: Report["days"]): Report["days"] {
  const months = new Map<string, { date: string; total: Paise; bills: number }>();
  for (const day of days) {
    const key = `${day.date.slice(0, 7)}-01`;
    const m = months.get(key) ?? { date: key, total: 0, bills: 0 };
    m.total += day.total;
    m.bills += day.bills;
    months.set(key, m);
  }
  return [...months.values()];
}

/** Bills as a CSV that Excel opens directly (with a BOM so ₹ and Hindi show correctly). */
export function billsCsv(bills: ReportBill[], headers: string[], statusLabel: (s: ReportBill["status"]) => string): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rupees = (p: Paise) => (p / 100).toFixed(2);
  const rows = [...bills]
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
    .map((b) => [b.number, b.date, b.customerName, b.customerPhone, rupees(b.total), rupees(b.total - b.balance), rupees(b.balance), statusLabel(b.status)]);
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
