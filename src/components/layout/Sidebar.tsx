import { NavLink } from "react-router";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { canSeeOwnerData } from "@/data/types";
import { cn } from "@/lib/cn";
import { BrandMark } from "./BrandMark";
import { NAV_ITEMS } from "./nav";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { person } = useSession();
  const isOwner = canSeeOwnerData(person?.role);

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <BrandMark />
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label={t("nav.menu")}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex h-12 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold transition-colors",
                isActive ? "bg-brand-800 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            <item.icon className="size-5 shrink-0" />
            <span className="flex-1">{t(item.labelKey)}</span>
            {item.ownerOnly && !isOwner ? <Lock className="size-4 opacity-60" /> : null}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-slate-400">v0.1 · {t("brand.name")}</div>
    </div>
  );
}
