import { ChevronDown, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/auth/LoginScreen";
import { useSession } from "@/auth/SessionProvider";
import { formatLongDate } from "@/lib/dates";
import { BrandMark } from "./BrandMark";
import { LanguageToggle } from "./LanguageToggle";

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t, i18n } = useTranslation();
  const { person, switchPerson } = useSession();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 print:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t("nav.menu")}
        className="-ml-1 rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="size-6" />
      </button>
      <div className="lg:hidden">
        <BrandMark className="[&>div]:hidden sm:[&>div]:block" />
      </div>
      <p className="hidden text-[15px] font-medium text-slate-500 lg:block">{formatLongDate(new Date(), i18n.language)}</p>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <LanguageToggle />
        {person ? (
          <button
            type="button"
            onClick={() => void switchPerson()}
            title={t("topbar.switchPerson")}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pr-2.5 pl-1.5 text-left shadow-sm hover:bg-slate-50"
          >
            <Avatar name={person.name} className="size-8 text-sm" />
            <span className="hidden leading-tight sm:block">
              <span className="block text-xs text-slate-500">{t("topbar.billingBy")}</span>
              <span className="block max-w-36 truncate text-sm font-semibold text-slate-900">{person.name}</span>
            </span>
            <ChevronDown className="size-4 text-slate-500" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
