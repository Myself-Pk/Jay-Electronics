import { todayISO } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { previewDelay, previewStore } from "./preview-store";
import type { AttentionItem, BackupStatus, PaymentMode, TodaySummary } from "./types";

const MODES_SHOWN: PaymentMode[] = ["cash", "upi", "debit_card", "credit_card", "bajaj"];

export async function getTodaySummary(): Promise<TodaySummary> {
  if (!supabase) {
    await previewDelay();
    return structuredClone(previewStore.today);
  }
  const today = todayISO();
  const [bills, payments] = await Promise.all([
    supabase
      .from("bills")
      .select("total, balance")
      .eq("doc_type", "bill")
      .eq("status", "saved")
      .eq("bill_date", today),
    supabase.from("payments").select("mode, amount").eq("direction", "in").eq("paid_on", today),
  ]);
  if (bills.error) throw bills.error;
  if (payments.error) throw payments.error;

  const byMode = new Map<PaymentMode, number>();
  for (const p of payments.data as { mode: PaymentMode; amount: number | string }[]) {
    byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + toPaise(p.amount));
  }
  const billRows = bills.data as { total: number | string; balance: number | string }[];
  return {
    salesPaise: billRows.reduce((sum, b) => sum + toPaise(b.total), 0),
    billCount: billRows.length,
    byMode: MODES_SHOWN.filter((m) => m === "cash" || m === "upi" || byMode.has(m)).map((mode) => ({
      mode,
      paise: byMode.get(mode) ?? 0,
    })),
    udhaarPaise: billRows.reduce((sum, b) => sum + toPaise(b.balance), 0),
  };
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

export async function getAttentionItems(): Promise<AttentionItem[]> {
  if (!supabase) {
    await previewDelay();
    return structuredClone(previewStore.attention);
  }
  const { data, error } = await supabase.from("v_attention_counts").select("*").single<AttentionRow>();
  if (error) throw error;
  const items: AttentionItem[] = [];
  if (data.warranty_pending > 0) {
    items.push({ kind: "warranty_registration", count: data.warranty_pending, brands: data.warranty_brands ?? [] });
  }
  if (data.low_stock > 0) items.push({ kind: "low_stock", count: data.low_stock });
  if (data.open_complaints > 0) items.push({ kind: "complaint", count: data.open_complaints });
  if (data.bajaj_pending_count > 0) {
    items.push({
      kind: "bajaj_pending",
      count: data.bajaj_pending_count,
      amountPaise: toPaise(data.bajaj_pending_amount),
    });
  }
  if (data.old_stock > 0) items.push({ kind: "old_stock", count: data.old_stock });
  return items;
}

/** Daily backup is built in week 2. */
export async function getBackupStatus(): Promise<BackupStatus> {
  return { state: "not_set_up" };
}
