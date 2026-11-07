import { fromPaise, toPaise } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { asBillError } from "./errors";
import { previewDb } from "./preview-billing";
import {
  previewCustomerDues,
  previewOwnedUnits,
  previewReceivePayment,
  previewSettleFinance,
} from "./preview-payments";
import { previewDelay } from "./preview-store";
import type {
  BillSummary,
  CustomerDues,
  CustomerPaymentRow,
  OwnedUnit,
  PendingFinance,
  ReceivePaymentInput,
} from "./types";

type Num = number | string;

// ---------- Customers and what they owe ----------

interface DuesRow {
  id: string;
  name: string;
  phone: string | null;
  area: string;
  customer_type: CustomerDues["type"];
  dues: Num;
  bill_count: number;
  oldest_due: string | null;
  last_bill: string | null;
}

export async function listCustomerDues(): Promise<CustomerDues[]> {
  if (!supabase) {
    await previewDelay();
    return previewCustomerDues();
  }
  const { data, error } = await supabase.from("v_customer_dues").select("*").order("name").limit(2000);
  if (error) throw error;
  return (data as DuesRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    area: r.area,
    type: r.customer_type,
    dues: toPaise(r.dues),
    billCount: Number(r.bill_count),
    oldestDue: r.oldest_due,
    lastBill: r.last_bill,
  }));
}

export async function getCustomerDues(id: string): Promise<CustomerDues | null> {
  if (!supabase) return previewCustomerDues().find((c) => c.id === id) ?? null;
  const { data, error } = await supabase.from("v_customer_dues").select("*").eq("id", id).maybeSingle<DuesRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    area: data.area,
    type: data.customer_type,
    dues: toPaise(data.dues),
    billCount: Number(data.bill_count),
    oldestDue: data.oldest_due,
    lastBill: data.last_bill,
  };
}

export async function listCustomerBills(customer: { id: string; phone: string | null }): Promise<BillSummary[]> {
  if (!supabase) {
    return previewDb()
      .bills.filter((b) => customer.phone && b.customerPhone === customer.phone)
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
  const { data, error } = await supabase
    .from("bills")
    .select("id, number, bill_date, customer_name, customer_phone, total, balance, status")
    .eq("customer_id", customer.id)
    .eq("doc_type", "bill")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (
    data as { id: string; number: string; bill_date: string; customer_name: string; customer_phone: string; total: Num; balance: Num; status: BillSummary["status"] }[]
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

export async function listCustomerPayments(customer: { id: string; phone: string | null }): Promise<CustomerPaymentRow[]> {
  if (!supabase) {
    return previewDb()
      .bills.filter((b) => customer.phone && b.customerPhone === customer.phone)
      .flatMap((b) =>
        b.payments.map((p) => ({ date: p.paidOn ?? b.date, mode: p.mode, amount: p.amount, billId: b.id, billNumber: b.number, status: p.status })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  const { data, error } = await supabase
    .from("payments")
    .select("paid_on, mode, amount, status, bill_id, bills(number)")
    .eq("customer_id", customer.id)
    .eq("direction", "in")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (
    data as unknown as { paid_on: string; mode: CustomerPaymentRow["mode"]; amount: Num; status: CustomerPaymentRow["status"]; bill_id: string | null; bills: { number: string } | null }[]
  ).map((p) => ({
    date: p.paid_on,
    mode: p.mode,
    amount: toPaise(p.amount),
    billId: p.bill_id,
    billNumber: p.bills?.number ?? null,
    status: p.status,
  }));
}

export async function listOwnedUnits(customerId: string): Promise<OwnedUnit[]> {
  if (!supabase) return previewOwnedUnits(customerId);
  const { data, error } = await supabase
    .from("units")
    .select(
      "id, serial_no, sold_on, warranty_start, warranty_registered_at, " +
        "products(model, capacity, warranty_free_months, warranty_prorata_months, brands(name, warranty_registration_required))",
    )
    .eq("customer_id", customerId)
    .eq("status", "sold")
    .order("sold_on", { ascending: false });
  if (error) throw error;
  return (
    data as unknown as {
      id: string;
      serial_no: string;
      sold_on: string | null;
      warranty_start: string | null;
      warranty_registered_at: string | null;
      products: {
        model: string;
        capacity: string;
        warranty_free_months: number;
        warranty_prorata_months: number;
        brands: { name: string; warranty_registration_required: boolean } | null;
      } | null;
    }[]
  ).map((u) => ({
    unitId: u.id,
    serial: u.serial_no,
    product: [u.products?.brands?.name, u.products?.model, u.products?.capacity].filter(Boolean).join(" "),
    soldOn: u.sold_on,
    warrantyStart: u.warranty_start,
    freeMonths: u.products?.warranty_free_months ?? 0,
    prorataMonths: u.products?.warranty_prorata_months ?? 0,
    registeredAt: u.warranty_registered_at,
    needsRegistration: u.products?.brands?.warranty_registration_required ?? false,
  }));
}

// ---------- Money coming in ----------

export async function receivePayment(input: ReceivePaymentInput): Promise<{ applied: { bill: string; amount: number }[]; duesLeft: number }> {
  if (!supabase) {
    await previewDelay(350);
    return previewReceivePayment(input);
  }
  const { data, error } = await supabase.rpc("receive_payment", {
    p: { customer_id: input.customerId, amount: fromPaise(input.amount), mode: input.mode, reference: input.reference },
  });
  if (error) throw asBillError(error) ?? error;
  const r = data as { applied: { bill: string; amount: Num }[]; dues_left: Num };
  return { applied: r.applied.map((a) => ({ bill: a.bill, amount: toPaise(a.amount) })), duesLeft: toPaise(r.dues_left) };
}

export async function listPendingFinance(): Promise<PendingFinance[]> {
  if (!supabase) {
    await previewDelay();
    return previewDb()
      .bills.filter((b) => b.status === "saved" && b.finance?.status === "pending")
      .map((b) => ({
        id: b.id,
        billId: b.id,
        billNumber: b.number,
        customerName: b.customerName,
        billDate: b.date,
        loanAmount: b.finance!.loanAmount,
        referenceNo: b.finance!.referenceNo,
      }));
  }
  const { data, error } = await supabase
    .from("finance_deals")
    .select("id, loan_amount, reference_no, bills(id, number, customer_name, bill_date)")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (
    data as unknown as { id: string; loan_amount: Num; reference_no: string; bills: { id: string; number: string; customer_name: string; bill_date: string } }[]
  ).map((f) => ({
    id: f.id,
    billId: f.bills.id,
    billNumber: f.bills.number,
    customerName: f.bills.customer_name,
    billDate: f.bills.bill_date,
    loanAmount: toPaise(f.loan_amount),
    referenceNo: f.reference_no,
  }));
}

export async function settleFinance(financeId: string, receivedAmount: number, receivedOn: string): Promise<void> {
  if (!supabase) {
    await previewDelay(300);
    previewSettleFinance(financeId, receivedOn);
    return;
  }
  const { error } = await supabase.rpc("settle_finance", {
    p: { finance_id: financeId, received_amount: fromPaise(receivedAmount), received_on: receivedOn },
  });
  if (error) throw asBillError(error) ?? error;
}
