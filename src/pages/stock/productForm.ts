/** The Add / Edit product form: what's typed (text) ↔ what gets saved, with friendly checks. */
import type { CatalogProduct, Category, ProductInput } from "@/data/types";
import { basisPointsToInput, paiseToInput, parsePercent, parseRupees, type Paise } from "@/lib/money";

export interface ProductDraft {
  id?: string;
  categoryId: string;
  brand: string;
  model: string;
  capacity: string;
  type: string;
  mrp: string;
  retail: string;
  dealer: string;
  minPrice: string;
  purchase: string;
  hasSerial: boolean;
  warrantyFree: string;
  warrantyProrata: string;
  lowStock: string;
  openingStock: string;
  hsn: string;
  gstRate: string;
  active: boolean;
}

export type ProductErrors = Partial<Record<keyof ProductDraft, string>>;

export function emptyProductDraft(category?: Category): ProductDraft {
  return {
    categoryId: category?.id ?? "",
    brand: "",
    model: "",
    capacity: "",
    type: "",
    mrp: "",
    retail: "",
    dealer: "",
    minPrice: "",
    purchase: "",
    hasSerial: category?.hasSerialByDefault ?? true,
    warrantyFree: "",
    warrantyProrata: "",
    lowStock: "",
    openingStock: "",
    hsn: "",
    gstRate: "",
    active: true,
  };
}

const moneyText = (p: Paise | null) => (p === null ? "" : paiseToInput(p));

export function productToDraft(p: CatalogProduct, purchasePrice: Paise | null): ProductDraft {
  return {
    id: p.id,
    categoryId: p.categoryId,
    brand: p.brand ?? "",
    model: p.model,
    capacity: p.capacity,
    type: p.type,
    mrp: moneyText(p.mrp),
    retail: moneyText(p.retailPrice),
    dealer: moneyText(p.dealerPrice),
    minPrice: moneyText(p.minPrice),
    purchase: moneyText(purchasePrice),
    hasSerial: p.hasSerial,
    warrantyFree: p.warrantyFreeMonths ? String(p.warrantyFreeMonths) : "",
    warrantyProrata: p.warrantyProrataMonths ? String(p.warrantyProrataMonths) : "",
    lowStock: p.lowStockLevel ? String(p.lowStockLevel) : "",
    openingStock: "",
    hsn: p.hsn,
    gstRate: basisPointsToInput(p.gstRate),
    active: true,
  };
}

/** "" → null; otherwise a valid amount or undefined (invalid). */
function optionalMoney(text: string): Paise | null | undefined {
  if (!text.trim()) return null;
  return parseRupees(text) ?? undefined;
}

function wholeNumber(text: string, max = 100_000): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n <= max ? n : undefined;
}

export type ProductResult = { ok: true; input: ProductInput } | { ok: false; errors: ProductErrors };

export function draftToProductInput(d: ProductDraft, categories: Category[], isOwner: boolean): ProductResult {
  const errors: ProductErrors = {};
  const category = categories.find((c) => c.id === d.categoryId);
  if (!category) errors.categoryId = "validation.required";
  if (!d.model.trim()) errors.model = "validation.required";

  const mrp = optionalMoney(d.mrp);
  if (mrp === undefined) errors.mrp = "validation.amount";
  const retail = optionalMoney(d.retail);
  if (retail === undefined) errors.retail = "validation.amount";
  else if (retail === null && !category?.isService) errors.retail = "validation.required";
  const dealer = optionalMoney(d.dealer);
  if (dealer === undefined) errors.dealer = "validation.amount";
  const minPrice = optionalMoney(d.minPrice);
  if (minPrice === undefined) errors.minPrice = "validation.amount";
  const purchase = optionalMoney(d.purchase);
  if (purchase === undefined) errors.purchase = "validation.amount";
  if (mrp && retail && retail > mrp) errors.retail = "stock.importer.problems.aboveMrp";

  const free = wholeNumber(d.warrantyFree, 240);
  if (free === undefined) errors.warrantyFree = "validation.months";
  const prorata = wholeNumber(d.warrantyProrata, 240);
  if (prorata === undefined) errors.warrantyProrata = "validation.months";
  const low = wholeNumber(d.lowStock);
  if (low === undefined) errors.lowStock = "validation.wholeNumber";
  const opening = wholeNumber(d.openingStock);
  if (opening === undefined) errors.openingStock = "validation.wholeNumber";
  const gst = d.gstRate.trim() ? parsePercent(d.gstRate) : null;
  if (gst === null && d.gstRate.trim()) errors.gstRate = "validation.percent";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const hasSerial = category!.isService ? false : d.hasSerial;
  return {
    ok: true,
    input: {
      ...(d.id ? { id: d.id } : {}),
      categoryId: category!.id,
      brand: d.brand.trim(),
      model: d.model.trim(),
      capacity: d.capacity.trim(),
      type: d.type.trim(),
      mrp: mrp ?? null,
      retailPrice: retail ?? 0,
      dealerPrice: dealer ?? null,
      minPrice: minPrice ?? null,
      hasSerial,
      warrantyFreeMonths: hasSerial ? (free ?? 0) : 0,
      warrantyProrataMonths: hasSerial ? (prorata ?? 0) : 0,
      lowStockLevel: low ?? 0,
      hsn: d.hsn.trim(),
      gstRate: gst,
      active: d.active,
      // Staff never send a purchase price, so it can't be wiped by someone who can't see it.
      ...(isOwner ? { purchasePrice: purchase ?? null } : {}),
      ...(!d.id && !hasSerial && opening ? { openingStock: opening } : {}),
    },
  };
}
