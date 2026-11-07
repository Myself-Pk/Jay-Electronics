import {
  ChartColumn,
  IndianRupee,
  MoonStar,
  Package,
  PackagePlus,
  Receipt,
  ReceiptText,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export type FeatureKey =
  | "bills"
  | "newBill"
  | "customers"
  | "stock"
  | "purchases"
  | "payment"
  | "warranty"
  | "reports"
  | "closeDay"
  | "search";

/** Parts of the app that are still being built, and when they'll be ready (PLAN.md section 12). */
export const FEATURES: Record<FeatureKey, { readyBy: string; icon: ComponentType<{ className?: string }> }> = {
  customers: { readyBy: "2026-11-22", icon: Users },
  search: { readyBy: "2026-11-22", icon: Search },
  stock: { readyBy: "2026-11-29", icon: Package },
  purchases: { readyBy: "2026-11-29", icon: PackagePlus },
  bills: { readyBy: "2026-12-06", icon: Receipt },
  newBill: { readyBy: "2026-12-06", icon: ReceiptText },
  payment: { readyBy: "2026-12-13", icon: IndianRupee },
  warranty: { readyBy: "2026-12-13", icon: ShieldCheck },
  reports: { readyBy: "2026-12-20", icon: ChartColumn },
  closeDay: { readyBy: "2026-12-20", icon: MoonStar },
};

export const BACKUP_READY_BY = "2026-11-22";
