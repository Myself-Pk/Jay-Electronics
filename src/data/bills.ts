import { fromPaise, toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { asBillError } from "./errors";
import { previewCancelBill, previewDb, previewMarkRegistered, previewSaveBill } from "./preview-billing";
import { previewDelay } from "./preview-store";
import type { BillDetails, BillSummary, PaymentMode, Role, SaveBillInput } from "./types";

/** Re-throw database "bill_error"s as BillError so screens can show a friendly message. */
function rethrow(error: unknown): never {
  throw asBillError(error) ?? error;
}

function toPayload(input: SaveBillInput) {
  return {
    customer: input.customer,
    items: input.items.map((i) => ({
      product_id: i.productId,
      unit_id: i.unitId ?? undefined,
      serial_no: i.serialNo || undefined,
      qty: i.qty,
      rate: fromPaise(i.rate),
    })),
    scrap: input.scrap.map((s) =>
      s.fixedAmount !== undefined
        ? { battery_type: s.batteryType, fixed_amount: fromPaise(s.fixedAmount) }
        : {
            battery_type: s.batteryType,
            weight_kg: fromPaise(s.weightCentiKg ?? 0),
            rate_per_kg: fromPaise(s.ratePerKg ?? 0),
          },
    ),
    payments: input.payments.map((p) => ({
      mode: p.mode,
      amount: fromPaise(p.towards),
      charges: fromPaise(p.charges),
      reference: p.reference ?? "",
    })),
    finance: input.finance
      ? {
          company: "Bajaj Finance",
          reference_no: input.finance.referenceNo,
          loan_amount: fromPaise(input.finance.loanAmount),
          customer_charges: fromPaise(input.finance.customerCharges),
        }
      : null,
  };
}

export async function saveBill(
  input: SaveBillInput,
  person: { name: string; role: Role },
): Promise<{ id: string; number: string }> {
  if (!supabase) {
    await previewDelay(400);
    return previewSaveBill(input, person);
  }
  const { data, error } = await supabase.rpc("save_bill", { p_bill: toPayload(input) });
  if (error) rethrow(error);
  const result = data as { id: string; number: string };
  return { id: result.id, number: result.number };
}

// ---------- Reading bills ----------

type Num = number | string;
interface BillJson {
  bill: {
    id: string;
    number: string;
    title: BillDetails["title"];
    bill_date: string;
    status: BillDetails["status"];
    cancel_reason: string | null;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    subtotal: Num;
    scrap_credit: Num;
    extra_charges: Num;
    round_off: Num;
    total: Num;
    paid: Num;
    balance: Num;
    share_token: string;
    created_at: string;
  };
  billed_by: string | null;
  items: {
    line_no: number;
    description: string;
    serial_no: string | null;
    warranty_text: string;
    hsn: string;
    qty: Num;
    rate: Num;
    amount: Num;
    unit_id: string | null;
    brand: string | null;
    needs_registration: boolean;
    registered_at: string | null;
  }[];
  scrap: { battery_type: string; weight_kg: Num | null; rate_per_kg: Num | null; fixed_amount: Num | null; value: Num }[];
  payments: { mode: PaymentMode; amount: Num; charges: Num; reference: string; status: "saved" | "cancelled" }[];
  finance: { company: string; reference_no: string; loan_amount: Num; customer_charges: Num; status: string } | null;
  shop: { shop_name: string; address: string; phone: string; gstin: string | null; upi_id: string | null; bill_terms: string };
}

function parseBill(j: BillJson): BillDetails {
  const b = j.bill;
  return {
    id: b.id,
    number: b.number,
    title: b.title,
    date: b.bill_date,
    status: b.status,
    cancelReason: b.cancel_reason,
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    customerAddress: b.customer_address,
    billedBy: j.billed_by,
    items: j.items.map((i) => ({
      lineNo: i.line_no,
      description: i.description,
      serialNo: i.serial_no,
      warrantyText: i.warranty_text,
      hsn: i.hsn,
      qty: Number(i.qty),
      rate: toPaise(i.rate),
      amount: toPaise(i.amount),
      unitId: i.unit_id,
      brand: i.brand,
      needsRegistration: i.needs_registration,
      registeredAt: i.registered_at,
    })),
    scrap: j.scrap.map((s) => ({
      batteryType: s.battery_type,
      weightKg: s.weight_kg === null ? null : String(Number(s.weight_kg)),
      ratePerKg: s.rate_per_kg === null ? null : toPaise(s.rate_per_kg),
      fixedAmount: s.fixed_amount === null ? null : toPaise(s.fixed_amount),
      value: toPaise(s.value),
    })),
    payments: j.payments.map((p) => ({
      mode: p.mode,
      amount: toPaise(p.amount),
      charges: toPaise(p.charges),
      reference: p.reference,
      status: p.status,
    })),
    finance: j.finance
      ? {
          company: j.finance.company,
          referenceNo: j.finance.reference_no,
          loanAmount: toPaise(j.finance.loan_amount),
          customerCharges: toPaise(j.finance.customer_charges),
          status: j.finance.status,
        }
      : null,
    subtotal: toPaise(b.subtotal),
    scrapCredit: toPaise(b.scrap_credit),
    extraCharges: toPaise(b.extra_charges),
    roundOff: toPaise(b.round_off),
    total: toPaise(b.total),
    paid: toPaise(b.paid),
    balance: toPaise(b.balance),
    shareToken: b.share_token,
    createdAt: b.created_at,
    shop: {
      shopName: j.shop.shop_name,
      address: j.shop.address,
      phone: j.shop.phone,
      gstin: j.shop.gstin ?? "",
      upiId: j.shop.upi_id ?? "",
      billTerms: j.shop.bill_terms,
    },
  };
}

export async function getBill(id: string): Promise<BillDetails | null> {
  if (!supabase) {
    await previewDelay();
    const bill = previewDb().bills.find((b) => b.id === id);
    return bill ? structuredClone(bill) : null;
  }
  const { data, error } = await supabase.rpc("get_bill", { p_bill_id: id });
  if (error) throw error;
  return data ? parseBill(data as BillJson) : null;
}

/** The bill a customer opens from the WhatsApp link (no login needed). */
export async function getSharedBill(token: string): Promise<BillDetails | null> {
  if (!supabase) {
    await previewDelay();
    const bill = previewDb().bills.find((b) => b.shareToken === token);
    return bill ? structuredClone(bill) : null;
  }
  const { data, error } = await supabase.rpc("get_shared_bill", { p_token: token });
  if (error) throw error;
  return data ? parseBill(data as BillJson) : null;
}

export interface BillFilter {
  /** yyyy-mm-dd, inclusive */
  from?: string;
  to?: string;
  search?: string;
}

export async function listBills(filter: BillFilter): Promise<BillSummary[]> {
  const search = (filter.search ?? "").trim().toLowerCase();
  if (!supabase) {
    await previewDelay();
    return previewDb()
      .bills.filter(
        (b) =>
          (!filter.from || b.date >= filter.from) &&
          (!filter.to || b.date <= filter.to) &&
          (!search ||
            b.number.toLowerCase().includes(search) ||
            b.customerName.toLowerCase().includes(search) ||
            b.customerPhone.includes(search)),
      )
      .map((b) => ({
        id: b.id,
        number: b.number,
        date: b.date,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        total: b.total,
        balance: b.balance,
        status: b.status,
      }));
  }
  let request = supabase
    .from("bills")
    .select("id, number, bill_date, customer_name, customer_phone, total, balance, status")
    .eq("doc_type", "bill");
  if (filter.from) request = request.gte("bill_date", filter.from);
  if (filter.to) request = request.lte("bill_date", filter.to);
  // Keep only characters that can appear in a bill number, name or phone (also keeps the filter syntax safe).
  const safe = search.replace(/[^\p{L}\p{N}\s/-]/gu, "").trim();
  if (safe) {
    request = request.or(`number.ilike.*${safe}*,customer_name.ilike.*${safe}*,customer_phone.ilike.*${safe}*`);
  }
  const { data, error } = await request.order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return (
    data as {
      id: string;
      number: string;
      bill_date: string;
      customer_name: string;
      customer_phone: string;
      total: Num;
      balance: Num;
      status: "saved" | "cancelled";
    }[]
  ).map((b) => ({
    id: b.id,
    number: b.number,
    date: b.bill_date,
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    total: toPaise(b.total),
    balance: toPaise(b.balance),
    status: b.status,
  }));
}

export async function cancelBill(id: string, reason: string, role: Role): Promise<void> {
  if (!supabase) {
    await previewDelay(300);
    previewCancelBill(id, reason, role);
    return;
  }
  const { error } = await supabase.rpc("cancel_bill", { p_bill_id: id, p_reason: reason });
  if (error) rethrow(error);
}

export async function markWarrantyRegistered(unitId: string, reference = ""): Promise<void> {
  if (!supabase) {
    await previewDelay(200);
    previewMarkRegistered(unitId, reference);
    return;
  }
  const { error } = await supabase.rpc("mark_warranty_registered", { p_unit_id: unitId, p_reference: reference });
  if (error) rethrow(error);
}
