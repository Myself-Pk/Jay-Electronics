import { DEFAULT_SETTINGS } from "./defaults";
import type { AttentionItem, Person, ShopSettings, TodaySummary } from "./types";

/**
 * Sample data used in Preview mode (no database connected).
 * Lives only in memory: refreshing the page resets it.
 */
interface PreviewStore {
  settings: ShopSettings;
  people: Person[];
  today: TodaySummary;
  attention: AttentionItem[];
}

export const previewStore: PreviewStore = {
  settings: structuredClone(DEFAULT_SETTINGS),
  people: [
    { id: "p-owner", name: "Owner", role: "owner", active: true, loginEmail: "owner@preview" },
    { id: "p-staff1", name: "Staff 1", role: "staff", active: true, loginEmail: "staff1@preview" },
    { id: "p-staff2", name: "Staff 2", role: "staff", active: true, loginEmail: "staff2@preview" },
    { id: "p-admin", name: "Pratham", role: "admin", active: true, loginEmail: "pratham@preview" },
  ],
  today: {
    salesPaise: 4850000,
    billCount: 6,
    byMode: [
      { mode: "cash", paise: 1800000 },
      { mode: "upi", paise: 2550000 },
    ],
    udhaarPaise: 500000,
  },
  attention: [
    { kind: "warranty_registration", count: 2, brands: ["Amaron", "Exide"] },
    { kind: "low_stock", count: 3 },
    { kind: "complaint", count: 1 },
    { kind: "bajaj_pending", count: 1, amountPaise: 2200000 },
  ],
};

/** Simulate a short network delay so loading states are visible in Preview mode. */
export function previewDelay(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
