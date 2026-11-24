import { supabase } from "@/lib/supabase";
import { asBillError, BillError } from "./errors";
import { previewDb } from "./preview-billing";
import { persistPreview, previewDelay } from "./preview-store";

/** The product a scanned barcode / QR code was linked to, or null if it's new. */
export async function findProductByBarcode(code: string): Promise<string | null> {
  const c = code.trim();
  if (!c) return null;
  if (!supabase) {
    return previewDb().barcodes?.[c] ?? null;
  }
  const { data, error } = await supabase.from("product_barcodes").select("product_id").eq("code", c).maybeSingle<{ product_id: string }>();
  if (error) throw error;
  return data?.product_id ?? null;
}

/**
 * Remember that this code belongs to this product. A code already linked to another product
 * is refused ("barcode_taken") unless `replace` is true (asked in a popup first).
 */
export async function linkBarcode(code: string, productId: string, replace = false): Promise<void> {
  const c = code.trim();
  if (!supabase) {
    await previewDelay(80);
    const db = previewDb();
    if (c.length < 3 || c.length > 200) throw new BillError("bad_barcode");
    const product = db.products.find((p) => p.id === productId && !p.isService);
    if (!product) throw new BillError("product_not_found");
    const current = db.barcodes?.[c];
    if (current && current !== productId && !replace) {
      const other = db.products.find((p) => p.id === current);
      throw new BillError("barcode_taken", { product: other ? [other.brand, other.model, other.capacity].filter(Boolean).join(" ") : "" });
    }
    db.barcodes = { ...(db.barcodes ?? {}), [c]: productId };
    persistPreview();
    return;
  }
  const { error } = await supabase.rpc("link_barcode", { p_code: c, p_product_id: productId, p_replace: replace });
  if (error) throw asBillError(error) ?? error;
}
