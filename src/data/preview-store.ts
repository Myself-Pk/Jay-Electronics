import { todayISO } from "@/lib/dates";
import { DEFAULT_SETTINGS } from "./defaults";
import type { BillDetails, CatalogProduct, Category, Customer, Person, PurchaseSummary, ShopSettings, Supplier } from "./types";

/** Same categories as the database starts with (initial migration). */
export const PREVIEW_CATEGORIES: Category[] = [
  ["Inverter battery", "8507", 1800, true, false],
  ["Automotive battery", "8507", 1800, true, false],
  ["Inverter / UPS", "8504", 1800, true, false],
  ["Lithium battery", "8507", 1800, true, false],
  ["Solar panel", "8541", 500, true, false],
  ["Solar inverter / PCU", "8504", 1800, true, false],
  ["Charge controller", "8504", 1800, true, false],
  ["Stabilizer", "8504", 1800, true, false],
  ["Accessories", "", 1800, false, false],
  ["Services", "9987", 1800, false, true],
].map(([name, hsn, gst, serial, service], i) => ({
  id: `cat-${i + 1}`,
  name: name as string,
  sortOrder: i + 1,
  defaultHsn: hsn as string,
  defaultGstRate: gst as number,
  hasSerialByDefault: serial as boolean,
  isService: service as boolean,
}));

/**
 * Sample shop used in Preview mode (no database connected).
 * It is saved in this browser (localStorage), so bills survive a refresh, the Back
 * button or a new tab — just like the real database. "Reset sample data" starts fresh.
 * Prices and serial numbers here are made up for demonstration.
 */

export interface PreviewUnit {
  id: string;
  productId: string;
  serial: string;
  status: "in_stock" | "sold" | "damaged";
  source: "purchase" | "added_at_billing" | "old_register";
  /** Sale date for old sales from the paper register (bills give it for the rest). */
  soldOn?: string | null;
  /** Reference number from the brand's warranty registration. */
  regRef?: string;
  arrivedOn: string | null;
  customerId: string | null;
  billId: string | null;
  registeredAt: string | null;
}

export type PreviewProduct = Omit<CatalogProduct, "inStock">;

interface PreviewStore {
  /** True once the sample bills have been created. */
  seeded: boolean;
  settings: ShopSettings;
  people: Person[];
  products: PreviewProduct[];
  /** Stock of products that don't have serial numbers. */
  counts: Record<string, number>;
  units: PreviewUnit[];
  customers: Customer[];
  /** Newest first. */
  bills: BillDetails[];
  /** Purchase price per product (owner only in the real app). */
  costs: Record<string, number>;
  suppliers: Supplier[];
  /** Newest first. */
  purchases: PurchaseSummary[];
  /** Added later; older saved copies may not have them yet. */
  expenses?: PreviewExpense[];
  dayCloses?: Record<string, PreviewDayClose>;
}

export interface PreviewExpense {
  id: string;
  date: string;
  category: string;
  amount: number;
  mode: "cash" | "upi" | "bank";
  note: string;
  status: "saved" | "cancelled";
  by: string;
}

export interface PreviewDayClose {
  openingCash: number;
  countedCash: number | null;
  expectedCash: number;
  note: string;
  by: string;
  closedAt: string;
}

const rupees = (r: number) => r * 100;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayISO(d);
}

const battery = (p: Partial<PreviewProduct> & Pick<PreviewProduct, "id" | "brand" | "model" | "capacity">): PreviewProduct => {
  const merged = sampleProduct(p);
  const category = PREVIEW_CATEGORIES.find((c) => c.name === merged.category)!;
  return { ...merged, categoryId: category.id, gstRate: category.defaultGstRate };
};

const sampleProduct = (p: Partial<PreviewProduct> & Pick<PreviewProduct, "id" | "brand" | "model" | "capacity">) => ({
  category: "Inverter battery",
  categoryOrder: 1,
  type: "",
  mrp: null,
  retailPrice: 0,
  dealerPrice: null,
  minPrice: null,
  hasSerial: true,
  isService: false,
  warrantyFreeMonths: 0,
  warrantyProrataMonths: 0,
  needsRegistration: p.brand === "Amaron" || p.brand === "Exide",
  lowStockLevel: 2,
  hsn: "8507",
  ...p,
});

const products: PreviewProduct[] = [
  battery({ id: "p-amaron-150", brand: "Amaron", model: "Tall Tubular", capacity: "150Ah", type: "Tall tubular",
    mrp: rupees(17500), retailPrice: rupees(14500), dealerPrice: rupees(13600), minPrice: rupees(13000),
    warrantyFreeMonths: 48, warrantyProrataMonths: 24 }),
  battery({ id: "p-exide-150", brand: "Exide", model: "Tall Tubular", capacity: "150Ah", type: "Tall tubular",
    mrp: rupees(17000), retailPrice: rupees(14200), dealerPrice: rupees(13300), minPrice: rupees(12800),
    warrantyFreeMonths: 36, warrantyProrataMonths: 24 }),
  battery({ id: "p-livguard-200", brand: "Livguard", model: "Tall Tubular", capacity: "200Ah", type: "Tall tubular",
    mrp: rupees(21000), retailPrice: rupees(17800), dealerPrice: rupees(16900),
    warrantyFreeMonths: 36, warrantyProrataMonths: 24, lowStockLevel: 1 }),
  battery({ id: "p-microtek-900", brand: "Microtek", category: "Inverter / UPS", categoryOrder: 3, model: "Sine Wave Inverter",
    capacity: "900VA", mrp: rupees(7500), retailPrice: rupees(6200), dealerPrice: rupees(5800),
    warrantyFreeMonths: 24, hsn: "8504" }),
  battery({ id: "p-luminous-1100", brand: "Luminous", category: "Inverter / UPS", categoryOrder: 3, model: "Sine Wave Inverter",
    capacity: "1100VA", mrp: rupees(8900), retailPrice: rupees(7400), dealerPrice: rupees(7000),
    warrantyFreeMonths: 24, hsn: "8504" }),
  battery({ id: "p-amaron-car35", brand: "Amaron", category: "Automotive battery", categoryOrder: 2, model: "Car Battery",
    capacity: "35Ah", mrp: rupees(5600), retailPrice: rupees(4900), dealerPrice: rupees(4600), warrantyFreeMonths: 36 }),
  battery({ id: "p-exide-bike5", brand: "Exide", category: "Automotive battery", categoryOrder: 2, model: "Bike Battery",
    capacity: "5Ah", mrp: rupees(1600), retailPrice: rupees(1350), dealerPrice: rupees(1250), warrantyFreeMonths: 24,
    lowStockLevel: 3 }),
  battery({ id: "p-trolley", brand: null, category: "Accessories", categoryOrder: 9, model: "Battery Trolley", capacity: "",
    retailPrice: rupees(800), dealerPrice: rupees(700), hasSerial: false, needsRegistration: false, lowStockLevel: 3, hsn: "" }),
  battery({ id: "p-water", brand: null, category: "Accessories", categoryOrder: 9, model: "Distilled Water", capacity: "5 L",
    mrp: rupees(90), retailPrice: rupees(60), dealerPrice: rupees(50), hasSerial: false, needsRegistration: false,
    lowStockLevel: 5, hsn: "" }),
  battery({ id: "s-delivery", brand: null, category: "Services", categoryOrder: 10, model: "Delivery & installation",
    capacity: "", retailPrice: rupees(300), hasSerial: false, isService: true, needsRegistration: false, lowStockLevel: 0,
    hsn: "9987" }),
  battery({ id: "s-charging", brand: null, category: "Services", categoryOrder: 10, model: "Battery charging",
    capacity: "", retailPrice: 0, hasSerial: false, isService: true, needsRegistration: false, lowStockLevel: 0, hsn: "9987" }),
  battery({ id: "s-repair", brand: null, category: "Services", categoryOrder: 10, model: "Repair", capacity: "",
    retailPrice: 0, hasSerial: false, isService: true, needsRegistration: false, lowStockLevel: 0, hsn: "9987" }),
];

/** [productId, serial prefix, days since each unit arrived] */
const unitPlan: [string, string, number[]][] = [
  ["p-amaron-150", "AMR150", [200, 60, 20, 5]],
  ["p-exide-150", "EXD150", [40, 10]],
  ["p-livguard-200", "LVG200", [30]],
  ["p-microtek-900", "MTK900", [90, 45, 12]],
  ["p-luminous-1100", "LUM1100", [25]],
  ["p-amaron-car35", "AMRC35", [50, 15]],
  ["p-exide-bike5", "EXDB5", [70, 60, 20, 8, 3]],
];

const units: PreviewUnit[] = unitPlan.flatMap(([productId, prefix, ages]) =>
  ages.map((age, i) => ({
    id: `u-${prefix}-${i + 1}`,
    productId,
    serial: `${prefix}-26${String(1000 + i * 37 + age).padStart(5, "0")}`,
    status: "in_stock" as const,
    source: "purchase" as const,
    arrivedOn: daysAgo(age),
    customerId: null,
    billId: null,
    registeredAt: null,
  })),
);

function freshStore(): PreviewStore {
  return {
    seeded: false,
    settings: structuredClone(DEFAULT_SETTINGS),
    people: [
      { id: "p-owner", name: "Owner", role: "owner", active: true, loginEmail: "owner@preview" },
      { id: "p-staff1", name: "Staff 1", role: "staff", active: true, loginEmail: "staff1@preview" },
      { id: "p-staff2", name: "Staff 2", role: "staff", active: true, loginEmail: "staff2@preview" },
      { id: "p-admin", name: "Pratham", role: "admin", active: true, loginEmail: "pratham@preview" },
    ],
    products: structuredClone(products),
    counts: { "p-trolley": 6, "p-water": 4 },
    units: structuredClone(units),
    customers: [
      { id: "c-1", name: "Sunil Kumar", phone: "9876500001", area: "Chas", type: "retail" },
      { id: "c-2", name: "Rakesh Mahato", phone: "9876500002", area: "Sector 4", type: "retail" },
      { id: "c-3", name: "Mahato Auto Works", phone: "9876500003", area: "Chas", type: "dealer" },
      { id: "c-4", name: "Anita Devi", phone: "9876500004", area: "Sector 12", type: "retail" },
    ],
    bills: [],
    costs: Object.fromEntries(products.filter((p) => !p.isService).map((p) => [p.id, Math.round(p.retailPrice * 0.85)])),
    suppliers: [
      { id: "s-1", name: "Shiv Shakti Distributors" },
      { id: "s-2", name: "Jharkhand Power House" },
    ],
    purchases: [],
  };
}

// Bump the version when the sample data changes shape, so old saved copies are replaced.
const STORAGE_KEY = "je-preview-data";
const STORAGE_VERSION = 2;

function loadSaved(): PreviewStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version: number; store: PreviewStore };
    return saved.version === STORAGE_VERSION ? saved.store : null;
  } catch {
    return null;
  }
}

export const previewStore: PreviewStore = loadSaved() ?? freshStore();

/** Save the sample shop in this browser. Call after every change. */
export function persistPreview(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, store: previewStore }));
  } catch {
    // Storage full or blocked (private browsing): Preview just won't survive a refresh.
  }
}

/** Throw away everything made in Preview mode and start the sample shop again. */
export function resetPreviewData(): void {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem("je-bill-draft");
  window.location.assign("/");
}

/** In-stock count for a product, worked out the same way the database does. */
export function previewStockOf(p: PreviewProduct): number {
  if (p.isService) return 0;
  if (p.hasSerial) return previewStore.units.filter((u) => u.productId === p.id && u.status === "in_stock").length;
  return previewStore.counts[p.id] ?? 0;
}

/** Simulate a short network delay so loading states are visible in Preview mode. */
export function previewDelay(ms = 150): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
