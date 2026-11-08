import { startOfMonthISO, startOfWeekISO, todayISO } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { previewDb } from "./preview-billing";
import { previewDelay, previewStockOf } from "./preview-store";
import {
  canSeeOwnerData,
  productLabel,
  type AttentionItem,
  type BackupStatus,
  type DashboardSummary,
  type PaymentMode,
  type Role,
  type TodaySummary,
} from "./types";

const MODES_SHOWN: PaymentMode[] = ["cash", "upi", "debit_card", "credit_card", "bajaj"];

function summarise(bills: { total: number; balance: number }[], payments: { mode: PaymentMode; amount: number }[]): TodaySummary {
  const byMode = new Map<PaymentMode, number>();
  for (const p of payments) byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + p.amount);
  return {
    salesPaise: bills.reduce((sum, b) => sum + b.total, 0),
    billCount: bills.length,
    // Always show cash and UPI; other modes only when used today.
    byMode: MODES_SHOWN.filter((m) => m === "cash" || m === "upi" || byMode.has(m)).map((mode) => ({
      mode,
      paise: byMode.get(mode) ?? 0,
    })),
    udhaarPaise: bills.reduce((sum, b) => sum + b.balance, 0),
  };
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const today = todayISO();
  if (!supabase) {
    await previewDelay();
    const bills = previewDb().bills.filter((b) => b.date === today && b.status === "saved");
    return summarise(
      bills,
      bills.flatMap((b) => b.payments.filter((p) => p.status === "saved")),
    );
  }
  const [bills, payments] = await Promise.all([
    supabase.from("bills").select("total, balance").eq("doc_type", "bill").eq("status", "saved").eq("bill_date", today),
    supabase.from("payments").select("mode, amount").eq("direction", "in").eq("status", "saved").eq("paid_on", today),
  ]);
  if (bills.error) throw bills.error;
  if (payments.error) throw payments.error;
  return summarise(
    (bills.data as { total: number | string; balance: number | string }[]).map((b) => ({
      total: toPaise(b.total),
      balance: toPaise(b.balance),
    })),
    (payments.data as { mode: PaymentMode; amount: number | string }[]).map((p) => ({ mode: p.mode, amount: toPaise(p.amount) })),
  );
}

interface AttentionRow {
  warranty_pending: number;
  warranty_brands: string[] | null;
  low_stock: number;
  open_complaints: number;
  bajaj_pending_count: number;
  bajaj_pending_amount: number | string;
  old_stock: number;
}

function toItems(r: AttentionRow): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (r.warranty_pending > 0) {
    items.push({ kind: "warranty_registration", count: r.warranty_pending, brands: r.warranty_brands ?? [] });
  }
  if (r.low_stock > 0) items.push({ kind: "low_stock", count: r.low_stock });
  if (r.open_complaints > 0) items.push({ kind: "complaint", count: r.open_complaints });
  if (r.bajaj_pending_count > 0) {
    items.push({ kind: "bajaj_pending", count: r.bajaj_pending_count, amountPaise: toPaise(r.bajaj_pending_amount) });
  }
  if (r.old_stock > 0) items.push({ kind: "old_stock", count: r.old_stock });
  return items;
}

export async function getAttentionItems(): Promise<AttentionItem[]> {
  if (!supabase) {
    await previewDelay();
    const db = previewDb();
    const sold = db.units.filter((u) => u.status === "sold" && !u.registeredAt && u.source !== "old_register");
    const pendingBrands = sold
      .map((u) => db.products.find((p) => p.id === u.productId))
      .filter((p) => p?.needsRegistration)
      .map((p) => p!.brand ?? "");
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const cutoff = todayISO(sixMonthsAgo);
    const bajaj = db.bills.filter((b) => b.finance?.status === "pending");
    return toItems({
      warranty_pending: pendingBrands.length,
      warranty_brands: [...new Set(pendingBrands)].sort(),
      low_stock: db.products.filter((p) => !p.isService && p.lowStockLevel > 0 && previewStockOf(p) <= p.lowStockLevel).length,
      open_complaints: 0,
      bajaj_pending_count: bajaj.length,
      bajaj_pending_amount: bajaj.reduce((sum, b) => sum + (b.finance?.loanAmount ?? 0), 0) / 100,
      old_stock: db.units.filter((u) => u.status === "in_stock" && (u.arrivedOn ?? "") < cutoff).length,
    });
  }
  const { data, error } = await supabase.from("v_attention_counts").select("*").single<AttentionRow>();
  if (error) throw error;
  return toItems(data);
}

/** Week / month sales, udhaar, last 7 days and top sellers for the Home screen. */
export async function getDashboardSummary(role: Role | undefined): Promise<DashboardSummary> {
  if (!supabase) {
    await previewDelay();
    return previewSummary(canSeeOwnerData(role));
  }
  const { data, error } = await supabase.rpc("dashboard_summary");
  if (error) throw error;
  const s = data as {
    week: number; week_bills: number; prev_week: number; month: number; month_bills: number; prev_month: number;
    udhaar: number; udhaar_customers: number; profit: number | null;
    days: { date: string; total: number; bills: number }[];
    top: { product: string; qty: number; amount: number }[];
  };
  return {
    week: toPaise(s.week),
    weekBills: s.week_bills,
    prevWeek: toPaise(s.prev_week),
    month: toPaise(s.month),
    monthBills: s.month_bills,
    prevMonth: toPaise(s.prev_month),
    udhaar: toPaise(s.udhaar),
    udhaarCustomers: s.udhaar_customers,
    days: s.days.map((d) => ({ date: d.date, total: toPaise(d.total), bills: d.bills })),
    top: s.top.map((t) => ({ product: t.product, qty: Number(t.qty), amount: toPaise(t.amount) })),
    profit: s.profit === null ? null : toPaise(s.profit),
  };
}

/** Same sums as dashboard_summary(), from the Preview sample shop. */
function previewSummary(isOwner: boolean): DashboardSummary {
  const db = previewDb();
  const bills = db.bills.filter((b) => b.status === "saved");
  const now = new Date();
  const today = todayISO(now);
  const shift = (iso: string, days: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    return todayISO(new Date(y, m - 1, d + days));
  };
  const weekStart = startOfWeekISO(now);
  const monthStart = startOfMonthISO(now);
  const lastMonth = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const last = new Date(y, m - 1, 0).getDate(); // days in previous month
    return todayISO(new Date(y, m - 2, Math.min(d, last)));
  };
  const sum = (from: string, to: string) => bills.filter((b) => b.date >= from && b.date <= to);
  const total = (list: typeof bills) => list.reduce((s, b) => s + b.total, 0);
  const month = sum(monthStart, today);
  const top = new Map<string, { qty: number; amount: number }>();
  for (const b of month) {
    for (const item of b.items) {
      const product = db.products.find((p) => productLabel(p) === item.description);
      if (product?.isService) continue;
      const t = top.get(item.description) ?? { qty: 0, amount: 0 };
      top.set(item.description, { qty: t.qty + item.qty, amount: t.amount + item.amount });
    }
  }
  const profit = month
    .flatMap((b) => b.items)
    .reduce((s, item) => {
      const product = db.products.find((p) => productLabel(p) === item.description);
      return s + item.amount - item.qty * (product ? (db.costs[product.id] ?? 0) : 0);
    }, 0);
  const unpaid = bills.filter((b) => b.balance > 0);
  return {
    week: total(sum(weekStart, today)),
    weekBills: sum(weekStart, today).length,
    prevWeek: total(sum(shift(weekStart, -7), shift(today, -7))),
    month: total(month),
    monthBills: month.length,
    prevMonth: total(sum(lastMonth(monthStart), lastMonth(today))),
    udhaar: unpaid.reduce((s, b) => s + b.balance, 0),
    udhaarCustomers: new Set(unpaid.map((b) => b.customerPhone || b.customerName)).size,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = shift(today, i - 6);
      const list = bills.filter((b) => b.date === date);
      return { date, total: total(list), bills: list.length };
    }),
    top: [...top].map(([product, v]) => ({ product, ...v })).sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 5),
    profit: isOwner ? profit : null,
  };
}

/** The latest backup taken on the shop computer (scripts/backup.mjs records each one). */
export async function getBackupStatus(): Promise<BackupStatus> {
  if (!supabase) return { state: "not_set_up" };
  const { data, error } = await supabase
    .from("backup_log")
    .select("taken_at, rows")
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ taken_at: string; rows: number }>();
  if (error) throw error;
  if (!data) return { state: "not_set_up" };
  return todayISO(new Date(data.taken_at)) === todayISO()
    ? { state: "done", at: data.taken_at, rows: data.rows }
    : { state: "missing", lastAt: data.taken_at };
}
