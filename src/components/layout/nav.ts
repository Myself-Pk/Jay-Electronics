import { ChartColumn, House, Package, Receipt, Settings, Truck, Users } from "lucide-react";
import type { ComponentType } from "react";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
}

/** The main menu. Keep it to 7 items or fewer. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: House },
  { to: "/bills", labelKey: "nav.bills", icon: Receipt },
  { to: "/customers", labelKey: "nav.customers", icon: Users },
  { to: "/stock", labelKey: "nav.stock", icon: Package },
  { to: "/purchases", labelKey: "nav.purchases", icon: Truck },
  { to: "/reports", labelKey: "nav.reports", icon: ChartColumn },
  { to: "/settings", labelKey: "nav.settings", icon: Settings, ownerOnly: true },
];
