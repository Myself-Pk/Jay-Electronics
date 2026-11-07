import { financialYearOf } from "@/lib/billNumber";
import { fromPaise, toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { persistPreview, previewDelay, previewStore } from "./preview-store";
import type { ShopSettings } from "./types";

interface SettingsRow {
  shop_name: string;
  address: string;
  phone: string;
  gstin: string | null;
  upi_id: string | null;
  bill_terms: string;
  gst_scheme: ShopSettings["gstScheme"];
  scheme_from: string;
  composition_rate_pct: number | string;
  bill_prefix: string;
  scrap_rate_per_kg: number | string;
  debit_card_pct: number | string;
  credit_card_pct: number | string;
  delivery_presets: (number | string)[];
}

function rowToSettings(row: SettingsRow, nextBillNumber: number): ShopSettings {
  return {
    shopName: row.shop_name,
    address: row.address,
    phone: row.phone,
    gstin: row.gstin ?? "",
    upiId: row.upi_id ?? "",
    billTerms: row.bill_terms,
    gstScheme: row.gst_scheme,
    schemeFrom: row.scheme_from,
    // Percentages are stored as numeric(5,2); basis points = hundredths of a percent.
    compositionRate: toPaise(row.composition_rate_pct),
    billPrefix: row.bill_prefix,
    nextBillNumber,
    scrapRatePerKg: toPaise(row.scrap_rate_per_kg),
    debitCardCharge: toPaise(row.debit_card_pct),
    creditCardCharge: toPaise(row.credit_card_pct),
    deliveryPresets: row.delivery_presets.map(toPaise),
  };
}

function settingsToRow(s: ShopSettings): SettingsRow {
  return {
    shop_name: s.shopName,
    address: s.address,
    phone: s.phone,
    gstin: s.gstin || null,
    upi_id: s.upiId || null,
    bill_terms: s.billTerms,
    gst_scheme: s.gstScheme,
    scheme_from: s.schemeFrom,
    composition_rate_pct: fromPaise(s.compositionRate),
    bill_prefix: s.billPrefix,
    scrap_rate_per_kg: fromPaise(s.scrapRatePerKg),
    debit_card_pct: fromPaise(s.debitCardCharge),
    credit_card_pct: fromPaise(s.creditCardCharge),
    delivery_presets: s.deliveryPresets.map(fromPaise),
  };
}

export async function getSettings(): Promise<ShopSettings> {
  if (!supabase) {
    await previewDelay();
    return structuredClone(previewStore.settings);
  }
  const fy = financialYearOf(new Date()).startYear;
  const [settings, counter] = await Promise.all([
    supabase.from("shop_settings").select("*").eq("id", 1).single<SettingsRow>(),
    supabase
      .from("bill_counters")
      .select("next_number")
      .eq("fy_start_year", fy)
      .eq("doc_type", "bill")
      .maybeSingle<{ next_number: number }>(),
  ]);
  if (settings.error) throw settings.error;
  if (counter.error) throw counter.error;
  return rowToSettings(settings.data, counter.data?.next_number ?? 1);
}

export async function saveSettings(next: ShopSettings): Promise<void> {
  if (!supabase) {
    await previewDelay(300);
    previewStore.settings = structuredClone(next);
    persistPreview();
    return;
  }
  const { error } = await supabase.from("shop_settings").update(settingsToRow(next)).eq("id", 1);
  if (error) throw error;
  const { error: counterError } = await supabase.rpc("set_next_bill_number", {
    p_fy_start_year: financialYearOf(new Date()).startYear,
    p_next_number: next.nextBillNumber,
  });
  if (counterError) throw counterError;
}
