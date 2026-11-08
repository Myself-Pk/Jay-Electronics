import { todayISO } from "@/lib/dates";
import { fromPaise, parseRupees, toPaise, type Paise } from "@/lib/money";
import {
  buildReport,
  type Mode,
  type Report,
  type ReportBill,
  type ReportExpense,
  type ReportInput,
  type ReportPayment,
  type ReportScrap,
} from "@/lib/report";
import { supabase } from "@/lib/supabase";
import { asBillError, BillError } from "./errors";
import { previewDb } from "./preview-billing";
import { persistPreview, previewDelay, previewStore } from "./preview-store";
import { canSeeOwnerData, productLabel, type Person, type Role } from "./types";

/** Expense kinds offered on Close Day (stored as these keys, shown translated). */
export const EXPENSE_CATEGORIES = ["tea", "transport", "salary", "electricity", "rent", "shop", "other"] as const;
export type ExpenseMode = "cash" | "upi" | "bank";

export interface ReportData {
  report: Report;
  /** The bills themselves, for the Excel download. */
  bills: ReportBill[];
}

export interface DayClose {
  day: string;
  openingCash: Paise;
  countedCash: Paise | null;
  expectedCash: Paise;
  difference: Paise | null;
  note: string;
  by: string | null;
  closedAt: string;
}

function rethrow(error: unknown): never {
  throw asBillError(error) ?? error;
}

// The database hands back at most 1,000 rows at a time, so long date ranges are read in pages.
const PAGE = 1000;
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await page(start, start + PAGE - 1);
    if (error) throw error;
    const list = (data ?? []) as T[];
    rows.push(...list);
    if (list.length < PAGE) return rows;
  }
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Sales, money, expenses and products sold between two dates (inclusive). */
export async function getReport(from: string, to: string, role: Role | undefined): Promise<ReportData> {
  const withProfit = canSeeOwnerData(role);
  const input = supabase ? await liveInput(from, to, withProfit) : await previewInput(from, to, withProfit);
  return { report: buildReport(input), bills: input.bills };
}

async function liveInput(from: string, to: string, withProfit: boolean): Promise<ReportInput> {
  const db = supabase!;
  type BillRow = {
    id: string; number: string; bill_date: string; customer_name: string; customer_phone: string;
    total: string; balance: string; scrap_credit: string; status: "saved" | "cancelled";
    bill_items: {
      description: string; qty: string; amount: string;
      products: { is_service: boolean; brands: { name: string } | null; categories: { name: string } | null } | null;
      bill_item_costs: { unit_cost: string } | { unit_cost: string }[] | null;
    }[];
  };
  const costs = withProfit ? ", bill_item_costs(unit_cost)" : "";
  const [bills, payments, expenses, scrap] = await Promise.all([
    readAll<BillRow>((a, b) =>
      db
        .from("bills")
        .select(
          `id, number, bill_date, customer_name, customer_phone, total, balance, scrap_credit, status,
           bill_items(description, qty, amount, products(is_service, brands(name), categories(name))${costs})`,
        )
        .eq("doc_type", "bill")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .order("bill_date")
        .order("id")
        .range(a, b),
    ),
    readAll<{ paid_on: string; direction: "in" | "out"; mode: Mode; amount: string; bills: { bill_date: string } | null }>((a, b) =>
      db
        .from("payments")
        .select("paid_on, direction, mode, amount, bills(bill_date)")
        .eq("status", "saved")
        .is("supplier_id", null)
        .gte("paid_on", from)
        .lte("paid_on", to)
        .order("paid_on")
        .order("id")
        .range(a, b),
    ),
    readAll<{ id: string; spent_on: string; category: string; amount: string; mode: Mode; note: string; status: "saved" | "cancelled" }>((a, b) =>
      db
        .from("expenses")
        .select("id, spent_on, category, amount, mode, note, status")
        .gte("spent_on", from)
        .lte("spent_on", to)
        .order("created_at")
        .range(a, b),
    ),
    readAll<{ entry_date: string; weight_kg: string | null; value: string }>((a, b) =>
      db
        .from("scrap_entries")
        .select("entry_date, weight_kg, value")
        .eq("direction", "in")
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("id")
        .range(a, b),
    ),
  ]);
  return {
    from,
    to,
    withProfit,
    bills: bills.map((b) => ({
      id: b.id,
      number: b.number,
      date: b.bill_date,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      total: toPaise(b.total),
      balance: toPaise(b.balance),
      scrapCredit: toPaise(b.scrap_credit),
      status: b.status,
      items: b.bill_items.map((i) => {
        const cost = one(i.bill_item_costs);
        return {
          description: i.description,
          qty: Number(i.qty),
          amount: toPaise(i.amount),
          brand: i.products?.brands?.name ?? null,
          category: i.products?.categories?.name ?? null,
          isService: i.products?.is_service ?? false,
          unitCost: cost ? toPaise(cost.unit_cost) : null,
        };
      }),
    })),
    payments: payments.map((p) => ({
      date: p.paid_on,
      direction: p.direction,
      mode: p.mode,
      amount: toPaise(p.amount),
      billDate: one(p.bills)?.bill_date ?? null,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      date: e.spent_on,
      category: e.category,
      amount: toPaise(e.amount),
      mode: e.mode,
      note: e.note,
      status: e.status,
    })),
    scrap: scrap.map((s) => ({
      date: s.entry_date,
      centiKg: s.weight_kg === null ? null : toPaise(s.weight_kg),
      value: toPaise(s.value),
    })),
  };
}

async function previewInput(from: string, to: string, withProfit: boolean): Promise<ReportInput> {
  await previewDelay();
  const db = previewDb();
  const productOf = (description: string) => db.products.find((p) => productLabel(p) === description);
  const bills: ReportBill[] = db.bills.map((b) => ({
    id: b.id,
    number: b.number,
    date: b.date,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    total: b.total,
    balance: b.balance,
    scrapCredit: b.scrapCredit,
    status: b.status,
    items: b.items.map((i) => {
      const product = productOf(i.description);
      return {
        description: i.description,
        qty: i.qty,
        amount: i.amount,
        brand: i.brand,
        category: product?.category ?? null,
        isService: product?.isService ?? false,
        unitCost: withProfit && product ? (db.costs[product.id] ?? 0) : null,
      };
    }),
  }));
  const payments: ReportPayment[] = db.bills.flatMap((b) =>
    b.payments
      .filter((p) => p.status === "saved")
      .map((p) => ({ date: p.paidOn ?? b.date, direction: "in" as const, mode: p.mode, amount: p.amount, billDate: b.date })),
  );
  const scrap: ReportScrap[] = db.bills
    .filter((b) => b.status === "saved")
    .flatMap((b) =>
      b.scrap.map((s) => ({ date: b.date, centiKg: s.weightKg === null ? null : (parseRupees(s.weightKg) ?? 0), value: s.value })),
    );
  const expenses: ReportExpense[] = (db.expenses ?? []).map((e) => ({ ...e }));
  return { from, to, withProfit, bills, payments, expenses, scrap };
}

/** Sales from the start of the financial year (for the ₹1.5 crore composition limit). */
export async function getSalesSince(from: string): Promise<{ date: string; total: Paise; scrapCredit: Paise; status: "saved" | "cancelled" }[]> {
  const to = todayISO();
  if (!supabase) {
    await previewDelay();
    return previewDb()
      .bills.filter((b) => b.date >= from && b.date <= to)
      .map((b) => ({ date: b.date, total: b.total, scrapCredit: b.scrapCredit, status: b.status }));
  }
  const db = supabase;
  const rows = await readAll<{ bill_date: string; total: string; scrap_credit: string; status: "saved" | "cancelled" }>((a, b) =>
    db
      .from("bills")
      .select("bill_date, total, scrap_credit, status")
      .eq("doc_type", "bill")
      .gte("bill_date", from)
      .lte("bill_date", to)
      .order("id")
      .range(a, b),
  );
  return rows.map((r) => ({ date: r.bill_date, total: toPaise(r.total), scrapCredit: toPaise(r.scrap_credit), status: r.status }));
}

// ---------- Expenses ----------

export async function addExpense(
  input: { category: string; amount: Paise; mode: ExpenseMode; note: string; date: string },
  person: Person,
): Promise<void> {
  if (input.amount <= 0) throw new BillError("bad_amount");
  if (!supabase) {
    await previewDelay();
    const db = previewDb();
    db.expenses = [
      ...(db.expenses ?? []),
      { id: `exp-${Date.now()}`, date: input.date, category: input.category, amount: input.amount, mode: input.mode, note: input.note, status: "saved", by: person.name },
    ];
    persistPreview();
    return;
  }
  const { error } = await supabase.from("expenses").insert({
    category: input.category,
    amount: fromPaise(input.amount),
    mode: input.mode,
    note: input.note,
    spent_on: input.date,
  });
  if (error) rethrow(error);
}

/** Owner only (the database refuses anyone else). */
export async function cancelExpense(id: string, role: Role): Promise<void> {
  if (!canSeeOwnerData(role)) throw new BillError("owner_only");
  if (!supabase) {
    await previewDelay();
    const e = (previewStore.expenses ?? []).find((x) => x.id === id);
    if (e) e.status = "cancelled";
    persistPreview();
    return;
  }
  const { data, error } = await supabase.from("expenses").update({ status: "cancelled" }).eq("id", id).select("id");
  if (error) rethrow(error);
  if (!data || data.length === 0) throw new BillError("owner_only");
}

// ---------- Close Day ----------

export async function getDayClose(day: string): Promise<DayClose | null> {
  if (!supabase) {
    await previewDelay();
    const c = previewDb().dayCloses?.[day];
    if (!c) return null;
    return {
      day,
      openingCash: c.openingCash,
      countedCash: c.countedCash,
      expectedCash: c.expectedCash,
      difference: c.countedCash === null ? null : c.countedCash - c.expectedCash,
      note: c.note,
      by: c.by,
      closedAt: c.closedAt,
    };
  }
  const { data, error } = await supabase
    .from("day_closes")
    .select("day, summary, expected_cash, counted_cash, difference, note, closed_at, people(name)")
    .eq("day", day)
    .maybeSingle<{
      day: string; summary: { opening_cash?: number | string }; expected_cash: string | null; counted_cash: string | null;
      difference: string | null; note: string; closed_at: string; people: { name: string } | { name: string }[] | null;
    }>();
  if (error) throw error;
  if (!data) return null;
  return {
    day: data.day,
    openingCash: toPaise(data.summary?.opening_cash ?? 0),
    countedCash: data.counted_cash === null ? null : toPaise(data.counted_cash),
    expectedCash: toPaise(data.expected_cash),
    difference: data.difference === null ? null : toPaise(data.difference),
    note: data.note,
    by: one(data.people)?.name ?? null,
    closedAt: data.closed_at,
  };
}

/** Cash kept in the drawer at the start of the last closed day (most shops keep the same change money). */
export async function getLastOpeningCash(before: string): Promise<Paise> {
  if (!supabase) {
    const closes = previewDb().dayCloses ?? {};
    const last = Object.keys(closes).filter((d) => d < before).sort().pop();
    return last ? closes[last].openingCash : 0;
  }
  const { data, error } = await supabase
    .from("day_closes")
    .select("summary")
    .lt("day", before)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle<{ summary: { opening_cash?: number | string } }>();
  if (error) throw error;
  return toPaise(data?.summary?.opening_cash ?? 0);
}

export async function closeDay(
  input: { day: string; openingCash: Paise; countedCash: Paise | null; note: string; expectedCash: Paise; summary: Record<string, unknown> },
  person: Person,
): Promise<{ expectedCash: Paise; difference: Paise | null }> {
  if (!supabase) {
    await previewDelay();
    if (input.day > todayISO()) throw new BillError("future_day");
    const db = previewDb();
    db.dayCloses = {
      ...(db.dayCloses ?? {}),
      [input.day]: {
        openingCash: input.openingCash,
        countedCash: input.countedCash,
        expectedCash: input.expectedCash,
        note: input.note,
        by: person.name,
        closedAt: new Date().toISOString(),
      },
    };
    persistPreview();
    return { expectedCash: input.expectedCash, difference: input.countedCash === null ? null : input.countedCash - input.expectedCash };
  }
  const { data, error } = await supabase.rpc("close_day", {
    p: {
      day: input.day,
      opening_cash: fromPaise(input.openingCash),
      counted_cash: input.countedCash === null ? null : fromPaise(input.countedCash),
      note: input.note,
      summary: input.summary,
    },
  });
  if (error) rethrow(error);
  const r = data as { expected_cash: number | string; difference: number | string | null };
  return { expectedCash: toPaise(r.expected_cash), difference: r.difference === null ? null : toPaise(r.difference) };
}
