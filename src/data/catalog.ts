import { toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { previewDb } from "./preview-billing";
import { previewDelay, previewStockOf } from "./preview-store";
import { productLabel, type CatalogProduct, type SerialLookup, type StockUnit } from "./types";

interface CatalogRow {
  id: string;
  brand: string | null;
  category_id: string;
  category: string;
  category_order: number;
  gst_rate_pct: number | string;
  model: string;
  capacity: string;
  type: string;
  mrp: number | string | null;
  retail_price: number | string;
  dealer_price: number | string | null;
  min_price: number | string | null;
  has_serial: boolean;
  is_service: boolean;
  warranty_free_months: number;
  warranty_prorata_months: number;
  needs_registration: boolean;
  low_stock_level: number;
  in_stock: number;
  hsn: string;
}

const money = (v: number | string | null) => (v === null ? null : toPaise(v));

function rowToProduct(r: CatalogRow): CatalogProduct {
  return {
    id: r.id,
    brand: r.brand,
    categoryId: r.category_id,
    category: r.category,
    categoryOrder: r.category_order,
    gstRate: toPaise(r.gst_rate_pct),
    model: r.model,
    capacity: r.capacity,
    type: r.type,
    mrp: money(r.mrp),
    retailPrice: toPaise(r.retail_price),
    dealerPrice: money(r.dealer_price),
    minPrice: money(r.min_price),
    hasSerial: r.has_serial,
    isService: r.is_service,
    warrantyFreeMonths: r.warranty_free_months,
    warrantyProrataMonths: r.warranty_prorata_months,
    needsRegistration: r.needs_registration,
    lowStockLevel: r.low_stock_level,
    inStock: r.in_stock,
    hsn: r.hsn,
  };
}

/** Every product the shop sells, with live stock. A shop has a few hundred at most, so we load them all. */
export async function listCatalog(): Promise<CatalogProduct[]> {
  if (!supabase) {
    await previewDelay();
    return previewDb().products.map((p) => ({ ...structuredClone(p), inStock: previewStockOf(p) }));
  }
  const { data, error } = await supabase
    .from("v_catalog")
    .select(
      "id, brand, category_id, category, category_order, gst_rate_pct, model, capacity, type, mrp, retail_price, dealer_price, min_price, " +
        "has_serial, is_service, warranty_free_months, warranty_prorata_months, needs_registration, low_stock_level, in_stock, hsn",
    )
    .eq("active", true)
    .order("category_order")
    .order("model");
  if (error) throw error;
  return (data as unknown as CatalogRow[]).map(rowToProduct);
}

/**
 * Search typed on the New Bill screen: every word must match brand, model, size, type or category.
 * "150ah amaron" finds "Amaron Tall Tubular 150Ah". In-stock items come first.
 */
export function searchCatalog(products: CatalogProduct[], query: string, limit = 8): CatalogProduct[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return products
    .filter((p) => {
      const text = `${p.brand ?? ""} ${p.model} ${p.capacity} ${p.type} ${p.category}`.toLowerCase();
      const compact = text.replace(/\s+/g, "");
      return words.every((w) => text.includes(w) || compact.includes(w));
    })
    .sort(
      (a, b) =>
        Number(b.inStock > 0 || b.isService) - Number(a.inStock > 0 || a.isService) ||
        a.categoryOrder - b.categoryOrder ||
        productLabel(a).localeCompare(productLabel(b)),
    )
    .slice(0, limit);
}

/** Serial-numbered units in stock for a product, oldest first (sell old stock first). */
export async function listInStockUnits(productId: string): Promise<StockUnit[]> {
  if (!supabase) {
    return previewDb()
      .units.filter((u) => u.productId === productId && u.status === "in_stock")
      .map((u) => ({ id: u.id, serial: u.serial, arrivedOn: u.arrivedOn }))
      .sort((a, b) => (a.arrivedOn ?? "").localeCompare(b.arrivedOn ?? ""));
  }
  const { data, error } = await supabase
    .from("units")
    .select("id, serial_no, arrived_on")
    .eq("product_id", productId)
    .eq("status", "in_stock")
    .order("arrived_on", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data as { id: string; serial_no: string; arrived_on: string | null }[]).map((u) => ({
    id: u.id,
    serial: u.serial_no,
    arrivedOn: u.arrived_on,
  }));
}

/** Find a battery by its serial number (what the barcode scanner types). */
export async function lookupSerial(serial: string): Promise<SerialLookup | null> {
  const wanted = serial.trim().toUpperCase();
  if (!wanted) return null;
  if (!supabase) {
    const db = previewDb();
    const unit = db.units.find((u) => u.serial.toUpperCase() === wanted);
    if (!unit) return null;
    const base = { unitId: unit.id, serial: unit.serial, productId: unit.productId };
    if (unit.status === "in_stock") return { status: "in_stock", ...base };
    if (unit.status === "sold") {
      const bill = db.bills.find((b) => b.id === unit.billId);
      return { status: "sold", ...base, billId: bill?.id ?? null, billNumber: bill?.number ?? null, customerName: bill?.customerName ?? null };
    }
    return { status: "other", ...base };
  }
  const { data, error } = await supabase.rpc("lookup_serial", { p_serial: wanted });
  if (error) throw error;
  if (!data) return null;
  const r = data as {
    unit_id: string;
    serial_no: string;
    status: string;
    product_id: string;
    bill_id: string | null;
    bill_number: string | null;
    customer_name: string | null;
  };
  const base = { unitId: r.unit_id, serial: r.serial_no, productId: r.product_id };
  if (r.status === "in_stock") return { status: "in_stock", ...base };
  if (r.status === "sold") {
    return { status: "sold", ...base, billId: r.bill_id, billNumber: r.bill_number, customerName: r.customer_name };
  }
  return { status: "other", ...base };
}
