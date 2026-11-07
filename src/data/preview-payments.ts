/**
 * Preview-mode versions of v_customer_dues / receive_payment / settle_finance
 * (supabase/migrations/20261112000000_payments.sql). Keep them in step.
 * In Preview, a customer's bills are matched by phone number.
 */
import { todayISO } from "@/lib/dates";
import { BillError } from "./errors";
import { previewDb } from "./preview-billing";
import { persistPreview } from "./preview-store";
import { productLabel, type BillDetails, type CustomerDues, type ReceivePaymentInput } from "./types";

const billsOf = (phone: string | null) =>
  previewDb().bills.filter((b) => phone && b.customerPhone === phone && b.status === "saved");

export function previewCustomerDues(): CustomerDues[] {
  return previewDb().customers.map((c) => {
    const bills = billsOf(c.phone);
    const unpaid = bills.filter((b) => b.balance > 0).map((b) => b.date).sort();
    return {
      ...c,
      dues: bills.reduce((sum, b) => sum + b.balance, 0),
      billCount: bills.length,
      oldestDue: unpaid[0] ?? null,
      lastBill: bills.map((b) => b.date).sort().at(-1) ?? null,
    };
  });
}

export function previewReceivePayment(input: ReceivePaymentInput) {
  const customer = previewDb().customers.find((c) => c.id === input.customerId);
  if (!customer) throw new BillError("customer_not_found");
  if (input.amount <= 0) throw new BillError("bad_payment");
  const unpaid: BillDetails[] = billsOf(customer.phone)
    .filter((b) => b.balance > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const dues = unpaid.reduce((sum, b) => sum + b.balance, 0);
  if (input.amount > dues) throw new BillError("more_than_dues", { dues: (dues / 100).toFixed(2) });

  let left = input.amount;
  const applied: { bill: string; amount: number }[] = [];
  for (const bill of unpaid) {
    if (left <= 0) break;
    const part = Math.min(left, bill.balance);
    bill.payments.push({ mode: input.mode, amount: part, charges: 0, reference: input.reference, status: "saved", paidOn: todayISO() });
    bill.paid += part;
    bill.balance -= part;
    applied.push({ bill: bill.number, amount: part });
    left -= part;
  }
  persistPreview();
  return { applied, duesLeft: dues - input.amount };
}

export function previewOwnedUnits(customerId: string) {
  const db = previewDb();
  return db.units
    .filter((u) => u.customerId === customerId && u.status === "sold")
    .map((u) => {
      const product = db.products.find((p) => p.id === u.productId);
      const soldOn = db.bills.find((b) => b.id === u.billId)?.date ?? null;
      return {
        unitId: u.id,
        serial: u.serial,
        product: product ? productLabel(product) : "",
        soldOn,
        warrantyStart: soldOn,
        freeMonths: product?.warrantyFreeMonths ?? 0,
        prorataMonths: product?.warrantyProrataMonths ?? 0,
        registeredAt: u.registeredAt,
        needsRegistration: product?.needsRegistration ?? false,
      };
    });
}

/** In Preview the Bajaj deal's id is its bill's id. */
export function previewSettleFinance(financeId: string, receivedOn: string) {
  const bill = previewDb().bills.find((b) => b.id === financeId);
  if (!bill?.finance) throw new BillError("bill_not_found");
  if (bill.finance.status !== "pending") throw new BillError("already_settled");
  if (receivedOn > todayISO()) throw new BillError("future_date");
  bill.finance.status = "received";
  persistPreview();
}
