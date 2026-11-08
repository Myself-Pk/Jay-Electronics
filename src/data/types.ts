import type { BasisPoints, Paise } from "@/lib/money";

export type { Paise };

export type Role = "owner" | "staff" | "admin";
export type GstScheme = "composition" | "regular";
export type PaymentMode = "cash" | "upi" | "debit_card" | "credit_card" | "bajaj" | "bank";

export interface ShopSettings {
  shopName: string;
  address: string;
  phone: string;
  gstin: string;
  upiId: string;
  billTerms: string;
  gstScheme: GstScheme;
  /** yyyy-mm-dd */
  schemeFrom: string;
  compositionRate: BasisPoints;
  billPrefix: string;
  /** Next bill number in the current financial year. */
  nextBillNumber: number;
  scrapRatePerKg: Paise;
  debitCardCharge: BasisPoints;
  creditCardCharge: BasisPoints;
  deliveryPresets: Paise[];
}

export interface Person {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  /** The (made-up) email this person logs in with behind the scenes. Never shown to users. */
  loginEmail: string;
}

export type LoginPerson = Pick<Person, "id" | "name" | "role" | "loginEmail">;

export function canSeeOwnerData(role: Role | undefined): boolean {
  return role === "owner" || role === "admin";
}

export interface TodaySummary {
  salesPaise: Paise;
  billCount: number;
  byMode: { mode: PaymentMode; paise: Paise }[];
  udhaarPaise: Paise;
}

export type AttentionItem =
  | { kind: "warranty_registration"; count: number; brands: string[] }
  | { kind: "low_stock"; count: number }
  | { kind: "complaint"; count: number }
  | { kind: "bajaj_pending"; count: number; amountPaise: Paise }
  | { kind: "old_stock"; count: number };

export interface DashboardSummary {
  week: Paise;
  weekBills: number;
  /** Same days of last week, for a fair comparison. */
  prevWeek: Paise;
  month: Paise;
  monthBills: number;
  /** Same days of last month. */
  prevMonth: Paise;
  udhaar: Paise;
  udhaarCustomers: number;
  /** Last 7 days, oldest first. */
  days: { date: string; total: Paise; bills: number }[];
  /** Best sellers this month (no services). */
  top: { product: string; qty: number; amount: Paise }[];
  /** Owner only; null for staff. */
  profit: Paise | null;
}

export type BackupStatus =
  | { state: "not_set_up" }
  | { state: "missing"; lastAt: string }
  | { state: "done"; at: string; rows: number };

// ---------- Products, customers and bills ----------

export type CustomerType = "retail" | "dealer";

export interface CatalogProduct {
  id: string;
  brand: string | null;
  categoryId: string;
  category: string;
  categoryOrder: number;
  /** GST rate (only printed once the shop moves to Regular GST). */
  gstRate: BasisPoints;
  model: string;
  capacity: string;
  type: string;
  mrp: Paise | null;
  retailPrice: Paise;
  dealerPrice: Paise | null;
  minPrice: Paise | null;
  hasSerial: boolean;
  isService: boolean;
  warrantyFreeMonths: number;
  warrantyProrataMonths: number;
  needsRegistration: boolean;
  lowStockLevel: number;
  inStock: number;
  hsn: string;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  defaultHsn: string;
  defaultGstRate: BasisPoints;
  hasSerialByDefault: boolean;
  isService: boolean;
}

/** What the Add / Edit product form saves. */
export interface ProductInput {
  id?: string;
  categoryId: string;
  /** Brand name; a new brand is created if needed. Empty for unbranded items. */
  brand: string;
  model: string;
  capacity: string;
  type: string;
  mrp: Paise | null;
  retailPrice: Paise;
  dealerPrice: Paise | null;
  minPrice: Paise | null;
  hasSerial: boolean;
  warrantyFreeMonths: number;
  warrantyProrataMonths: number;
  lowStockLevel: number;
  hsn: string;
  gstRate: BasisPoints | null;
  active?: boolean;
  /** Owner only. Left out = unchanged. */
  purchasePrice?: Paise | null;
  /** New count-based products only. */
  openingStock?: number;
}

export interface Supplier {
  id: string;
  name: string;
}

/** "New stock arrived" (from a distributor) or opening stock (already in the shop). */
export interface StockEntryInput {
  kind: "purchase" | "opening_stock";
  supplierName: string;
  supplierBillNo: string;
  /** yyyy-mm-dd */
  billDate: string;
  items: { productId: string; qty: number; rate: Paise; gstPaid: Paise; serials: string[] }[];
}

export interface PurchaseSummary {
  id: string;
  kind: "purchase" | "opening_stock";
  supplierName: string | null;
  supplierBillNo: string;
  billDate: string;
  total: Paise;
  itemCount: number;
}

/** "Amaron Tall Tubular 150Ah" */
export function productLabel(p: Pick<CatalogProduct, "brand" | "model" | "capacity">): string {
  return [p.brand, p.model, p.capacity].filter(Boolean).join(" ");
}

export interface StockUnit {
  id: string;
  serial: string;
  /** yyyy-mm-dd */
  arrivedOn: string | null;
}

export type SerialLookup =
  | { status: "in_stock"; unitId: string; serial: string; productId: string }
  | {
      status: "sold";
      unitId: string;
      serial: string;
      productId: string;
      billId: string | null;
      billNumber: string | null;
      customerName: string | null;
    }
  | { status: "other"; unitId: string; serial: string; productId: string };

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  area: string;
  type: CustomerType;
}

export type BillPaymentMode = Exclude<PaymentMode, "bajaj">;

export interface SaveBillInput {
  customer: { id?: string; phone?: string; name?: string; area?: string; type?: CustomerType };
  items: { productId: string; unitId?: string | null; serialNo?: string; qty: number; rate: Paise }[];
  scrap: { batteryType: string; weightCentiKg?: number; ratePerKg?: Paise; fixedAmount?: Paise }[];
  payments: { mode: BillPaymentMode; towards: Paise; charges: Paise; reference?: string }[];
  finance: { referenceNo: string; loanAmount: Paise; customerCharges: Paise } | null;
}

export interface BillItem {
  lineNo: number;
  description: string;
  serialNo: string | null;
  warrantyText: string;
  hsn: string;
  qty: number;
  rate: Paise;
  amount: Paise;
  unitId: string | null;
  brand: string | null;
  needsRegistration: boolean;
  registeredAt: string | null;
}

export interface BillScrap {
  batteryType: string;
  /** e.g. "18.5" */
  weightKg: string | null;
  ratePerKg: Paise | null;
  fixedAmount: Paise | null;
  value: Paise;
}

export interface BillPayment {
  mode: PaymentMode;
  amount: Paise;
  charges: Paise;
  reference: string;
  status: "saved" | "cancelled";
  /** yyyy-mm-dd; set for udhaar paid later (Preview mode). */
  paidOn?: string;
}

// ---------- Customers, udhaar and Bajaj ----------

export interface CustomerDues extends Customer {
  dues: Paise;
  billCount: number;
  /** Date of the oldest bill still unpaid. */
  oldestDue: string | null;
  lastBill: string | null;
}

export interface CustomerPaymentRow {
  /** yyyy-mm-dd */
  date: string;
  mode: PaymentMode;
  amount: Paise;
  billId: string | null;
  billNumber: string | null;
  status: "saved" | "cancelled";
}

export interface OwnedUnit {
  unitId: string;
  serial: string;
  product: string;
  /** yyyy-mm-dd */
  soldOn: string | null;
  warrantyStart: string | null;
  freeMonths: number;
  prorataMonths: number;
  registeredAt: string | null;
  needsRegistration: boolean;
}

export type BillPaymentModeNoBajaj = Exclude<PaymentMode, "bajaj">;

export interface ReceivePaymentInput {
  customerId: string;
  amount: Paise;
  mode: BillPaymentModeNoBajaj;
  reference: string;
}

export interface PendingFinance {
  id: string;
  billId: string;
  billNumber: string;
  customerName: string;
  /** yyyy-mm-dd */
  billDate: string;
  loanAmount: Paise;
  referenceNo: string;
}

export interface ShopForBill {
  shopName: string;
  address: string;
  phone: string;
  gstin: string;
  upiId: string;
  billTerms: string;
}

export interface BillDetails {
  id: string;
  number: string;
  title: "bill_of_supply" | "tax_invoice";
  /** yyyy-mm-dd */
  date: string;
  status: "saved" | "cancelled";
  cancelReason: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  billedBy: string | null;
  items: BillItem[];
  scrap: BillScrap[];
  payments: BillPayment[];
  finance: { company: string; referenceNo: string; loanAmount: Paise; customerCharges: Paise; status: string } | null;
  subtotal: Paise;
  scrapCredit: Paise;
  extraCharges: Paise;
  roundOff: Paise;
  total: Paise;
  paid: Paise;
  balance: Paise;
  shareToken: string;
  createdAt: string;
  shop: ShopForBill;
}

export interface BillSummary {
  id: string;
  number: string;
  date: string;
  customerName: string;
  customerPhone: string;
  total: Paise;
  balance: Paise;
  status: "saved" | "cancelled";
}
