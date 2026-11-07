import type { BasisPoints, Paise } from "@/lib/money";

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

export type BackupStatus = { state: "not_set_up" } | { state: "missing" } | { state: "done"; at: string };
