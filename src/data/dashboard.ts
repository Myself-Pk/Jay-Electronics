import { todayISO } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { previewDb } from "./preview-billing";
import { previewDelay, previewStockOf } from "./preview-store";
import type { AttentionItem, BackupStatus, PaymentMode, TodaySummary } from "./types";

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
    const sold = db.units.filter((u) => u.status === "sold" && !u.registeredAt);
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
