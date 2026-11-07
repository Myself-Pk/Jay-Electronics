import { fromPaise, toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { asBillError } from "./errors";
import { previewDb } from "./preview-billing";
import { PREVIEW_CATEGORIES, previewDelay } from "./preview-store";
import { previewSaveProduct } from "./preview-stock";
import type { Category, ProductInput, Role } from "./types";

export async function listCategories(): Promise<Category[]> {
  if (!supabase) return PREVIEW_CATEGORIES.map((c) => ({ ...c }));
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order, default_hsn, default_gst_rate_pct, has_serial_by_default, is_service")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (
    data as {
      id: string;
      name: string;
      sort_order: number;
      default_hsn: string;
      default_gst_rate_pct: number | string;
      has_serial_by_default: boolean;
      is_service: boolean;
    }[]
  ).map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    defaultHsn: c.default_hsn,
    defaultGstRate: toPaise(c.default_gst_rate_pct),
    hasSerialByDefault: c.has_serial_by_default,
    isService: c.is_service,
  }));
}

export async function listBrandNames(): Promise<string[]> {
  if (!supabase) {
    return [...new Set(previewDb().products.map((p) => p.brand).filter((b): b is string => !!b))].sort();
  }
  const { data, error } = await supabase.from("brands").select("name").eq("active", true).order("name");
  if (error) throw error;
  return (data as { name: string }[]).map((b) => b.name);
}

/** What the shop pays for a product. Owner only — staff get null (the database refuses them). */
export async function getPurchasePrice(productId: string): Promise<number | null> {
  if (!supabase) return previewDb().costs[productId] ?? null;
  const { data, error } = await supabase
    .from("product_costs")
    .select("purchase_price")
    .eq("product_id", productId)
    .maybeSingle<{ purchase_price: number | string }>();
  if (error) throw error;
  return data ? toPaise(data.purchase_price) : null;
}

const money = (p: number | null | undefined) => (p === null || p === undefined ? null : fromPaise(p));

/** Add (no id) or edit a product. Returns its id. */
export async function saveProduct(input: ProductInput, role: Role): Promise<string> {
  if (!supabase) {
    await previewDelay(250);
    return previewSaveProduct(input, role);
  }
  const { data, error } = await supabase.rpc("save_product", {
    p: {
      id: input.id ?? null,
      category_id: input.categoryId,
      brand: input.brand,
      model: input.model,
      capacity: input.capacity,
      type: input.type,
      mrp: money(input.mrp),
      retail_price: fromPaise(input.retailPrice),
      dealer_price: money(input.dealerPrice),
      min_price: money(input.minPrice),
      has_serial: input.hasSerial,
      warranty_free_months: input.warrantyFreeMonths,
      warranty_prorata_months: input.warrantyProrataMonths,
      low_stock_level: input.lowStockLevel,
      hsn: input.hsn,
      gst_rate_pct: money(input.gstRate),
      active: input.active ?? true,
      ...(input.purchasePrice !== undefined ? { purchase_price: money(input.purchasePrice) } : {}),
      ...(input.openingStock ? { opening_stock: input.openingStock } : {}),
    },
  });
  if (error) throw asBillError(error) ?? error;
  return data as string;
}
