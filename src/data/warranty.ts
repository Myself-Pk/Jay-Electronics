import { todayISO } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { asBillError, BillError } from "./errors";
import { previewDb } from "./preview-billing";
import { persistPreview, previewDelay, type PreviewUnit } from "./preview-store";
import { productLabel } from "./types";

/** One battery / inverter as the Warranty Check screen shows it. */
export interface WarrantyUnit {
  unitId: string;
  serial: string;
  status: "in_stock" | "sold" | "replaced" | "returned_to_supplier" | "damaged" | "loaned";
  source: string;
  product: string;
  brand: string | null;
  /** yyyy-mm-dd */
  soldOn: string | null;
  warrantyStart: string | null;
  freeMonths: number;
  prorataMonths: number;
  needsRegistration: boolean;
  registeredAt: string | null;
  regRef: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  billId: string | null;
  billNumber: string | null;
}

export interface OldSaleInput {
  productId: string;
  serial: string;
  /** yyyy-mm-dd */
  soldOn: string;
  phone: string;
  name: string;
}

function rethrow(error: unknown): never {
  throw asBillError(error) ?? error;
}

interface Row {
  unit_id: string; serial_no: string; status: WarrantyUnit["status"]; source: string; product: string; brand: string | null;
  sold_on: string | null; warranty_start: string | null; warranty_free_months: number; warranty_prorata_months: number;
  needs_registration: boolean; warranty_registered_at: string | null; warranty_reg_ref: string | null;
  customer_id: string | null; customer_name: string | null; customer_phone: string | null; bill_id: string | null; bill_number: string | null;
}

const fromRow = (r: Row): WarrantyUnit => ({
  unitId: r.unit_id,
  serial: r.serial_no,
  status: r.status,
  source: r.source,
  product: r.product,
  brand: r.brand,
  soldOn: r.sold_on,
  warrantyStart: r.warranty_start,
  freeMonths: r.warranty_free_months ?? 0,
  prorataMonths: r.warranty_prorata_months ?? 0,
  needsRegistration: r.needs_registration,
  registeredAt: r.warranty_registered_at,
  regRef: r.warranty_reg_ref ?? "",
  customerId: r.customer_id,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  billId: r.bill_id,
  billNumber: r.bill_number,
});

/** Find batteries by part of a serial (3+ characters), a mobile number, or a bill number. */
export async function searchWarranty(query: string): Promise<WarrantyUnit[]> {
  const q = query.trim();
  if (!q) return [];
  if (!supabase) {
    await previewDelay(80);
    return previewSearch(q);
  }
  const { data, error } = await supabase.rpc("warranty_search", { p_query: q });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

/**
 * Sales of brands that need registration (Exide, Amaron) that nobody has registered yet, oldest first.
 * Old paper-register sales are left out (same rule as Home's "Needs attention").
 */
export async function listPendingRegistrations(): Promise<WarrantyUnit[]> {
  if (!supabase) {
    await previewDelay();
    return previewUnits()
      .filter((u) => u.status === "sold" && u.needsRegistration && !u.registeredAt && u.source !== "old_register")
      .sort((a, b) => (a.soldOn ?? "").localeCompare(b.soldOn ?? ""));
  }
  const { data, error } = await supabase
    .from("v_warranty_units")
    .select("*")
    .eq("status", "sold")
    .eq("needs_registration", true)
    .is("warranty_registered_at", null)
    .neq("source", "old_register")
    .order("sold_on", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

/** A battery sold before the app, from the paper register. Returns the new unit's id. */
export async function addOldSale(input: OldSaleInput): Promise<string> {
  if (!supabase) {
    await previewDelay();
    return previewAddOldSale(input);
  }
  const { data, error } = await supabase.rpc("add_old_sale", {
    p: { product_id: input.productId, serial_no: input.serial, sold_on: input.soldOn, phone: input.phone, name: input.name },
  });
  if (error) rethrow(error);
  return (data as { unit_id: string }).unit_id;
}

// ---------- Preview mode (same rules as warranty_search / add_old_sale) ----------

function previewUnits(): WarrantyUnit[] {
  const db = previewDb();
  return db.units.map((u: PreviewUnit) => {
    const product = db.products.find((p) => p.id === u.productId);
    const bill = u.billId ? db.bills.find((b) => b.id === u.billId) : undefined;
    const customer = u.customerId ? db.customers.find((c) => c.id === u.customerId) : undefined;
    const soldOn = u.soldOn ?? (u.status === "sold" ? (bill?.date ?? null) : null);
    return {
      unitId: u.id,
      serial: u.serial,
      status: u.status,
      source: u.source,
      product: product ? productLabel(product) : "",
      brand: product?.brand ?? null,
      soldOn,
      warrantyStart: soldOn,
      freeMonths: product?.warrantyFreeMonths ?? 0,
      prorataMonths: product?.warrantyProrataMonths ?? 0,
      needsRegistration: product?.needsRegistration ?? false,
      registeredAt: u.registeredAt,
      regRef: u.regRef ?? "",
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? bill?.customerName ?? null,
      customerPhone: customer?.phone ?? (bill?.customerPhone || null),
      billId: u.status === "sold" ? (bill?.id ?? null) : null,
      billNumber: u.status === "sold" ? (bill?.number ?? null) : null,
    };
  });
}

function previewSearch(raw: string): WarrantyUnit[] {
  const serial = raw.replace(/\s/g, "").toUpperCase();
  const digits = raw.replace(/\D/g, "");
  return previewUnits()
    .filter((u) => {
      const bySerial = serial.length >= 3 && u.serial.toUpperCase().includes(serial);
      const byPhone = digits.length >= 10 && u.customerPhone === digits.slice(-10) && u.status !== "in_stock";
      const seq = u.billNumber ? Number(u.billNumber.split("/").pop()) : NaN;
      const byBill =
        u.status !== "in_stock" &&
        u.billNumber !== null &&
        (u.billNumber.toUpperCase() === raw.toUpperCase() || (/^\d{1,6}$/.test(raw) && seq === Number(raw)));
      return bySerial || byPhone || byBill;
    })
    .sort((a, b) => (b.soldOn ?? "").localeCompare(a.soldOn ?? "") || a.serial.localeCompare(b.serial))
    .slice(0, 30);
}

function previewAddOldSale(input: OldSaleInput): string {
  const db = previewDb();
  const product = db.products.find((p) => p.id === input.productId);
  if (!product) throw new BillError("product_not_found");
  if (product.isService || !product.hasSerial) throw new BillError("no_serial_product", { product: product.model });
  const serial = input.serial.trim();
  if (!serial) throw new BillError("serial_required", { product: product.model });
  const existing = db.units.find((u) => u.serial.toUpperCase() === serial.toUpperCase());
  if (existing) throw new BillError("serial_exists", { serial: existing.serial });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.soldOn) || input.soldOn > todayISO() || input.soldOn < "2000-01-01") {
    throw new BillError("bad_sale_date");
  }
  const digits = input.phone.replace(/\D/g, "");
  if (!digits) throw new BillError("customer_required");
  const phone = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new BillError("bad_phone");
  let customer = db.customers.find((c) => c.phone === phone);
  if (!customer) {
    if (!input.name.trim()) throw new BillError("customer_name_required");
    customer = { id: `c-${Date.now()}`, name: input.name.trim(), phone, area: "", type: "retail" };
    db.customers.push(customer);
  }
  const id = `u-old-${Date.now()}`;
  db.units.push({
    id,
    productId: product.id,
    serial,
    status: "sold",
    source: "old_register",
    arrivedOn: null,
    customerId: customer.id,
    billId: null,
    registeredAt: null,
    soldOn: input.soldOn,
  });
  persistPreview();
  return id;
}
