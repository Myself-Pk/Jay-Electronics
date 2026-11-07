import { fromPaise, toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { asBillError } from "./errors";
import { previewDb } from "./preview-billing";
import { previewDelay } from "./preview-store";
import { previewReceiveStock } from "./preview-stock";
import type { PurchaseSummary, StockEntryInput, Supplier } from "./types";

export async function listSuppliers(): Promise<Supplier[]> {
  if (!supabase) return previewDb().suppliers.map((s) => ({ ...s }));
  const { data, error } = await supabase.from("suppliers").select("id, name").eq("active", true).order("name");
  if (error) throw error;
  return data as Supplier[];
}

/** Save "New stock arrived" (or opening stock). Everything is saved together or not at all. */
export async function receiveStock(input: StockEntryInput): Promise<string> {
  if (!supabase) {
    await previewDelay(350);
    return previewReceiveStock(input);
  }
  const { data, error } = await supabase.rpc("receive_stock", {
    p: {
      kind: input.kind,
      supplier_name: input.supplierName,
      supplier_bill_no: input.supplierBillNo,
      bill_date: input.billDate,
      items: input.items.map((i) => ({
        product_id: i.productId,
        qty: i.qty,
        rate: fromPaise(i.rate),
        gst_paid: fromPaise(i.gstPaid),
        serials: i.serials,
      })),
    },
  });
  if (error) throw asBillError(error) ?? error;
  return data as string;
}

/** Recent stock entries with amounts. Owner only: the database shows staff nothing here. */
export async function listPurchases(): Promise<PurchaseSummary[]> {
  if (!supabase) {
    await previewDelay();
    return previewDb().purchases.map((p) => ({ ...p }));
  }
  const { data, error } = await supabase
    .from("purchases")
    .select("id, kind, supplier_bill_no, bill_date, total, suppliers(name), purchase_items(qty)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      kind: PurchaseSummary["kind"];
      supplier_bill_no: string;
      bill_date: string;
      total: number | string;
      suppliers: { name: string } | null;
      purchase_items: { qty: number }[];
    }[]
  ).map((p) => ({
    id: p.id,
    kind: p.kind,
    supplierName: p.suppliers?.name ?? null,
    supplierBillNo: p.supplier_bill_no,
    billDate: p.bill_date,
    total: toPaise(p.total),
    itemCount: p.purchase_items.reduce((n, i) => n + Number(i.qty), 0),
  }));
}
