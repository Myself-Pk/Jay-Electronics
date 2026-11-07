/**
 * Preview-mode version of the database's save_product / receive_stock rules
 * (supabase/migrations/20261110000000_products_stock.sql). Keep the two in step.
 */
import { todayISO } from "@/lib/dates";
import { BillError } from "./errors";
import { previewDb } from "./preview-billing";
import { PREVIEW_CATEGORIES, persistPreview, type PreviewProduct, type PreviewUnit } from "./preview-store";
import { canSeeOwnerData, productLabel, type ProductInput, type Role, type StockEntryInput } from "./types";

export function previewSaveProduct(input: ProductInput, role: Role): string {
  if (!canSeeOwnerData(role)) throw new BillError("owner_only");
  const db = previewDb();
  const model = input.model.trim();
  if (!model) throw new BillError("model_required");
  const category = PREVIEW_CATEGORIES.find((c) => c.id === input.categoryId);
  if (!category) throw new BillError("category_not_found", { category: input.categoryId });
  const brand = input.brand.trim() || null;
  const capacity = input.capacity.trim();
  const label = productLabel({ brand, model, capacity });

  const same = (p: PreviewProduct) =>
    (p.brand ?? "").toLowerCase() === (brand ?? "").toLowerCase() &&
    p.model.toLowerCase() === model.toLowerCase() &&
    p.capacity.toLowerCase() === capacity.toLowerCase() &&
    p.id !== input.id;
  if (db.products.some(same)) throw new BillError("product_exists", { product: label });
  if (input.mrp !== null && input.retailPrice > input.mrp) throw new BillError("above_mrp", { product: label, mrp: input.mrp / 100 });

  const hasSerial = category.isService ? false : input.hasSerial;
  const fields: Omit<PreviewProduct, "id"> = {
    brand,
    categoryId: category.id,
    category: category.name,
    categoryOrder: category.sortOrder,
    gstRate: input.gstRate ?? category.defaultGstRate,
    model,
    capacity,
    type: input.type.trim(),
    mrp: input.mrp,
    retailPrice: input.retailPrice,
    dealerPrice: input.dealerPrice,
    minPrice: input.minPrice,
    hasSerial,
    isService: category.isService,
    warrantyFreeMonths: input.warrantyFreeMonths,
    warrantyProrataMonths: input.warrantyProrataMonths,
    needsRegistration: brand !== null && ["amaron", "exide"].includes(brand.toLowerCase()),
    lowStockLevel: input.lowStockLevel,
    hsn: input.hsn.trim() || category.defaultHsn,
  };

  let id = input.id;
  if (!id) {
    id = `p-${crypto.randomUUID()}`;
    db.products.push({ id, ...fields });
    if ((input.openingStock ?? 0) > 0 && !hasSerial && !category.isService) db.counts[id] = input.openingStock!;
  } else {
    const existing = db.products.find((p) => p.id === id);
    if (!existing) throw new BillError("product_not_found");
    const hasStockHistory = db.units.some((u) => u.productId === id) || (db.counts[id] ?? 0) !== 0;
    if (existing.hasSerial !== hasSerial && hasStockHistory) throw new BillError("cannot_change_serial", { product: label });
    Object.assign(existing, fields);
    if (input.active === false) db.products.splice(db.products.indexOf(existing), 1);
  }
  if (input.purchasePrice !== undefined && input.purchasePrice !== null) db.costs[id] = input.purchasePrice;
  persistPreview();
  return id;
}

export function previewReceiveStock(input: StockEntryInput): string {
  const db = previewDb();
  if (input.items.length === 0) throw new BillError("no_items");
  if (input.billDate > todayISO()) throw new BillError("future_date");
  let supplierName: string | null = null;
  if (input.kind === "purchase") {
    supplierName = input.supplierName.trim();
    if (!supplierName) throw new BillError("supplier_required");
  }

  // Check everything first; change nothing until it all checks out.
  const seen = new Set<string>();
  const lines = input.items.map((item) => {
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) throw new BillError("product_not_found");
    const label = productLabel(product);
    if (product.isService) throw new BillError("service_not_stock", { product: label });
    if (item.rate < 0 || item.gstPaid < 0) throw new BillError("bad_rate", { product: label });
    let serials: string[] = [];
    let qty = item.qty;
    if (product.hasSerial) {
      serials = item.serials.map((s) => s.trim().toUpperCase()).filter(Boolean);
      qty = serials.length;
      if (qty === 0) throw new BillError("serial_required", { product: label });
      for (const serial of serials) {
        if (seen.has(serial)) throw new BillError("duplicate_serial", { serial });
        if (db.units.some((u) => u.serial.toUpperCase() === serial)) throw new BillError("serial_exists", { serial });
        seen.add(serial);
      }
    } else if (!(qty > 0) || !Number.isInteger(qty)) {
      throw new BillError("bad_qty", { product: label });
    }
    const amount = qty * item.rate + item.gstPaid;
    return { product, serials, qty, amount, unitCost: Math.round(amount / qty) };
  });

  if (supplierName && !db.suppliers.some((s) => s.name.toLowerCase() === supplierName!.toLowerCase())) {
    db.suppliers.push({ id: `s-${crypto.randomUUID()}`, name: supplierName });
  }
  const id = `pu-${crypto.randomUUID()}`;
  for (const line of lines) {
    if (line.product.hasSerial) {
      for (const serial of line.serials) {
        const unit: PreviewUnit = {
          id: `u-${crypto.randomUUID()}`,
          productId: line.product.id,
          serial,
          status: "in_stock",
          source: "purchase",
          arrivedOn: input.billDate,
          customerId: null,
          billId: null,
          registeredAt: null,
        };
        db.units.push(unit);
      }
    } else {
      db.counts[line.product.id] = (db.counts[line.product.id] ?? 0) + line.qty;
    }
    if (line.unitCost > 0) db.costs[line.product.id] = line.unitCost;
  }
  db.purchases.unshift({
    id,
    kind: input.kind,
    supplierName,
    supplierBillNo: input.supplierBillNo.trim(),
    billDate: input.billDate,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
  });
  persistPreview();
  return id;
}
