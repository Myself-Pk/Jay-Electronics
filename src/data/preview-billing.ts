/**
 * Preview-mode version of the database's save_bill / cancel_bill rules.
 * It follows supabase/migrations/20261108000000_billing.sql so the app behaves
 * the same with sample data as it will with the real database.
 */
import { formatBillNumber, financialYearOf } from "@/lib/billNumber";
import { cardCharge, computeTotals, scrapByWeight, warrantyText } from "@/lib/billMath";
import { todayISO } from "@/lib/dates";
import { fromPaise } from "@/lib/money";
import { BillError } from "./errors";
import { persistPreview, previewStore, type PreviewUnit } from "./preview-store";
import { productLabel, type BillDetails, type BillItem, type Customer, type Role, type SaveBillInput } from "./types";

/** The preview store, with a few sample bills made on first use. */
export function previewDb() {
  if (!previewStore.seeded) {
    previewStore.seeded = true;
    seedSampleBills();
    persistPreview();
  }
  return previewStore;
}

const isOwnerRole = (role: Role) => role === "owner" || role === "admin";

export function previewSaveBill(
  input: SaveBillInput,
  person: { name: string; role: Role },
): { id: string; number: string; shareToken: string } {
  const store = previewStore;
  const today = todayISO();
  const s = store.settings;

  if (s.gstScheme === "regular" && today >= s.schemeFrom) throw new BillError("regular_gst_not_ready");
  if (input.items.length === 0) throw new BillError("no_items");

  // ----- Customer -----
  const phone = (input.customer.phone ?? "").replace(/\D/g, "") || null;
  const typedName = input.customer.name?.trim() || null;
  let customer: Customer | null = null;
  let newCustomer: Customer | null = null;
  if (input.customer.id) {
    customer = store.customers.find((c) => c.id === input.customer.id) ?? null;
    if (!customer) throw new BillError("customer_not_found");
  } else if (phone) {
    if (!/^[6-9]\d{9}$/.test(phone)) throw new BillError("bad_phone");
    customer = store.customers.find((c) => c.phone === phone) ?? null;
    if (!customer) {
      if (!typedName) throw new BillError("customer_name_required");
      newCustomer = {
        id: `c-${crypto.randomUUID()}`,
        name: typedName,
        phone,
        area: input.customer.area?.trim() ?? "",
        type: input.customer.type ?? "retail",
      };
      customer = newCustomer;
    }
  }

  // ----- Items (checked first; nothing changes until everything is valid) -----
  const owner = isOwnerRole(person.role);
  const seen = new Set<string>();
  let needsCustomer = false;
  const resolved = input.items.map((item) => {
    const product = store.products.find((p) => p.id === item.productId);
    if (!product) throw new BillError("product_not_found");
    const label = productLabel(product);
    if (item.qty <= 0 || (!product.isService && !Number.isInteger(item.qty))) {
      throw new BillError("bad_qty", { product: label });
    }
    if (item.rate < 0) throw new BillError("bad_rate", { product: label });
    if (product.mrp !== null && item.rate > product.mrp) {
      throw new BillError("above_mrp", { product: label, mrp: fromPaise(product.mrp) });
    }
    if (!owner && product.minPrice !== null && item.rate < product.minPrice) {
      throw new BillError("below_min_price", { product: label });
    }

    let unit: PreviewUnit | null = null;
    let newSerial: string | null = null;
    if (product.hasSerial) {
      needsCustomer = true;
      if (item.qty !== 1) throw new BillError("bad_qty", { product: label });
      const serial = (item.serialNo ?? "").trim().toUpperCase();
      if (item.unitId) {
        unit = store.units.find((u) => u.id === item.unitId) ?? null;
        if (!unit) throw new BillError("serial_not_available", { serial: "" });
      } else {
        if (!serial) throw new BillError("serial_required", { product: label });
        unit = store.units.find((u) => u.serial.toUpperCase() === serial) ?? null;
      }
      if (unit) {
        if (seen.has(unit.id)) throw new BillError("duplicate_serial", { serial: unit.serial });
        if (unit.status === "sold") {
          const soldOn = store.bills.find((b) => b.id === unit!.billId);
          throw new BillError("serial_sold", { serial: unit.serial, bill: soldOn?.number, customer: soldOn?.customerName });
        }
        if (unit.status !== "in_stock") throw new BillError("serial_not_available", { serial: unit.serial });
        if (unit.productId !== product.id) throw new BillError("serial_other_product", { serial: unit.serial });
        seen.add(unit.id);
      } else {
        newSerial = serial;
      }
    }
    return { item, product, label, unit, newSerial };
  });

  // ----- Money -----
  const scrapValues = input.scrap.map((sc) =>
    sc.fixedAmount !== undefined ? sc.fixedAmount : scrapByWeight(sc.weightCentiKg ?? 0, sc.ratePerKg ?? 0),
  );
  if (scrapValues.some((v) => v <= 0)) throw new BillError("bad_scrap");
  if (input.payments.some((p) => p.towards <= 0 || p.charges < 0)) throw new BillError("bad_payment");
  if (input.finance && (input.finance.loanAmount <= 0 || input.finance.customerCharges < 0)) {
    throw new BillError("bad_finance");
  }
  if (input.finance) needsCustomer = true;
  const totals = computeTotals({
    lines: input.items.map((i) => ({ qty: i.qty, rate: i.rate })),
    scrapValues,
    payments: input.payments,
    finance: input.finance,
  });
  if (totals.total < 0) throw new BillError("negative_total");
  if (totals.paid > totals.total) {
    throw new BillError("overpaid", { paid: fromPaise(totals.paid), total: fromPaise(totals.total) });
  }
  if (totals.balance > 0) needsCustomer = true;
  if (needsCustomer && !customer) throw new BillError("customer_required");

  // ----- Everything checks out: save -----
  if (newCustomer) store.customers.push(newCustomer);
  const now = new Date();
  const fy = financialYearOf(now);
  const usedThisYear = store.bills.filter((b) => b.number.includes(`/${fy.label}/`)).map((b) => Number(b.number.split("/")[2]));
  const seq = Math.max(s.nextBillNumber, ...usedThisYear.map((n) => n + 1));
  s.nextBillNumber = seq + 1;
  const number = formatBillNumber(s.billPrefix, now, seq);
  const id = `b-${crypto.randomUUID()}`;
  const shareToken = crypto.randomUUID().replace(/-/g, "");

  const items: BillItem[] = resolved.map(({ item, product, label, unit, newSerial }, i) => {
    if (product.hasSerial) {
      if (!unit) {
        unit = {
          id: `u-${crypto.randomUUID()}`,
          productId: product.id,
          serial: newSerial!,
          status: "in_stock",
          source: "added_at_billing",
          arrivedOn: today,
          customerId: null,
          billId: null,
          registeredAt: null,
        };
        store.units.push(unit);
      }
      unit.status = "sold";
      unit.customerId = customer?.id ?? null;
      unit.billId = id;
    } else if (!product.isService) {
      store.counts[product.id] = (store.counts[product.id] ?? 0) - item.qty;
    }
    return {
      lineNo: i + 1,
      description: label,
      serialNo: unit?.serial ?? null,
      warrantyText: product.hasSerial ? warrantyText(product.warrantyFreeMonths, product.warrantyProrataMonths) : "",
      hsn: product.hsn,
      qty: item.qty,
      rate: item.rate,
      amount: item.qty * item.rate,
      unitId: unit?.id ?? null,
      brand: product.brand,
      needsRegistration: product.needsRegistration,
      registeredAt: null,
    };
  });

  const bill: BillDetails = {
    id,
    number,
    title: "bill_of_supply",
    date: today,
    status: "saved",
    cancelReason: null,
    customerName: customer?.name ?? typedName ?? "",
    customerPhone: customer?.phone ?? "",
    customerAddress: customer?.area ?? input.customer.area ?? "",
    billedBy: person.name,
    items,
    scrap: input.scrap.map((sc, i) => ({
      batteryType: sc.batteryType,
      weightKg: sc.fixedAmount === undefined ? fromPaise(sc.weightCentiKg ?? 0).replace(/\.00$/, "") : null,
      ratePerKg: sc.fixedAmount === undefined ? (sc.ratePerKg ?? null) : null,
      fixedAmount: sc.fixedAmount ?? null,
      value: scrapValues[i],
    })),
    payments: [
      ...input.payments.map((p) => ({
        mode: p.mode,
        amount: p.towards + p.charges,
        charges: p.charges,
        reference: p.reference ?? "",
        status: "saved" as const,
      })),
      ...(input.finance
        ? [{ mode: "bajaj" as const, amount: input.finance.loanAmount, charges: 0, reference: input.finance.referenceNo, status: "saved" as const }]
        : []),
    ],
    finance: input.finance
      ? {
          company: "Bajaj Finance",
          referenceNo: input.finance.referenceNo,
          loanAmount: input.finance.loanAmount,
          customerCharges: input.finance.customerCharges,
          status: "pending",
        }
      : null,
    ...totals,
    shareToken,
    createdAt: now.toISOString(),
    shop: {
      shopName: s.shopName,
      address: s.address,
      phone: s.phone,
      gstin: s.gstin,
      upiId: s.upiId,
      billTerms: s.billTerms,
    },
  };
  store.bills.unshift(bill);
  persistPreview();
  return { id, number, shareToken };
}

export function previewCancelBill(id: string, reason: string, role: Role) {
  if (!isOwnerRole(role)) throw new BillError("owner_only");
  if (!reason.trim()) throw new BillError("reason_required");
  const bill = previewStore.bills.find((b) => b.id === id);
  if (!bill) throw new BillError("bill_not_found");
  if (bill.status === "cancelled") throw new BillError("already_cancelled");
  bill.status = "cancelled";
  bill.cancelReason = reason.trim();
  for (const item of bill.items) {
    const unit = item.unitId ? previewStore.units.find((u) => u.id === item.unitId) : undefined;
    if (unit) {
      unit.status = "in_stock";
      unit.customerId = null;
      unit.billId = null;
      unit.registeredAt = null;
    } else {
      const product = previewStore.products.find((p) => productLabel(p) === item.description);
      if (product && !product.isService && !product.hasSerial) {
        previewStore.counts[product.id] = (previewStore.counts[product.id] ?? 0) + item.qty;
      }
    }
  }
  bill.payments.forEach((p) => (p.status = "cancelled"));
  if (bill.finance) bill.finance.status = "cancelled";
  persistPreview();
}

export function previewMarkRegistered(unitId: string) {
  const unit = previewStore.units.find((u) => u.id === unitId);
  if (!unit || unit.status !== "sold") throw new BillError("serial_not_available", { serial: "" });
  unit.registeredAt = new Date().toISOString();
  for (const bill of previewStore.bills) {
    for (const item of bill.items) if (item.unitId === unitId) item.registeredAt = unit.registeredAt;
  }
  persistPreview();
}

function seedSampleBills() {
  const staff = { name: "Staff 1", role: "staff" as const };
  const unitOf = (productId: string, n = 0) =>
    previewStore.units.filter((u) => u.productId === productId && u.status === "in_stock")[n];
  try {
    const amaron = unitOf("p-amaron-150", 1);
    previewSaveBill(
      {
        customer: { id: "c-1" },
        items: [
          { productId: "p-amaron-150", unitId: amaron.id, qty: 1, rate: 1_450_000 },
          { productId: "p-trolley", qty: 1, rate: 80_000 },
          { productId: "s-delivery", qty: 1, rate: 30_000 },
        ],
        scrap: [{ batteryType: "Inverter battery", weightCentiKg: 1800, ratePerKg: 10_500 }],
        payments: [
          { mode: "upi", towards: 1_000_000, charges: 0 },
          { mode: "cash", towards: 371_000, charges: 0 },
        ],
        finance: null,
      },
      staff,
    );
    previewSaveBill(
      {
        customer: { id: "c-3", type: "dealer" },
        items: [
          { productId: "p-exide-bike5", unitId: unitOf("p-exide-bike5", 0).id, qty: 1, rate: 125_000 },
          { productId: "p-exide-bike5", unitId: unitOf("p-exide-bike5", 1).id, qty: 1, rate: 125_000 },
        ],
        scrap: [],
        payments: [{ mode: "cash", towards: 150_000, charges: 0 }],
        finance: null,
      },
      staff,
    );
    // ₹20,400 of goods + ₹500 Bajaj charges; Bajaj pays ₹15,000, the customer pays ₹5,900 down by debit card.
    previewSaveBill(
      {
        customer: { id: "c-4" },
        items: [
          { productId: "p-microtek-900", unitId: unitOf("p-microtek-900", 0).id, qty: 1, rate: 620_000 },
          { productId: "p-exide-150", unitId: unitOf("p-exide-150", 0).id, qty: 1, rate: 1_420_000 },
        ],
        scrap: [],
        payments: [{ mode: "debit_card", towards: 590_000, charges: cardCharge(590_000, 100) }],
        finance: { referenceNo: "DO-SAMPLE-01", loanAmount: 1_500_000, customerCharges: 50_000 },
      },
      staff,
    );
  } catch (err) {
    console.error("Could not create sample bills", err);
  }
}
