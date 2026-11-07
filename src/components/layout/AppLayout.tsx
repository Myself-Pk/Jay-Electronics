import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ui/Confirm";
import { resetPreviewData } from "@/data/preview-store";
import { cn } from "@/lib/cn";
import { isPreview } from "@/lib/supabase";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

function PreviewBanner() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  if (!isPreview) return null;

  const reset = async () => {
    const ok = await confirm({
      title: t("preview.resetTitle"),
      message: t("preview.resetMessage"),
      confirmLabel: t("preview.resetYes"),
      tone: "danger",
    });
    if (ok) resetPreviewData();
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 print:hidden">
      <span className="inline-flex items-center gap-2">
        <Info className="size-4 shrink-0" />
        {t("preview.banner")}
      </span>
      <button type="button" onClick={() => void reset()} className="font-semibold underline underline-offset-2 hover:text-amber-950">
        {t("preview.reset")}
      </button>
    </div>
  );
}

/** Menu on the left (a slide-out drawer on phones), top bar, and the page. */
export function AppLayout() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh">
      <PreviewBanner />
      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-slate-200 bg-white lg:block print:hidden">
          <Sidebar />
        </aside>

        {/* Phone / small screen drawer */}
        <div className={cn("fixed inset-0 z-40 lg:hidden print:hidden", menuOpen ? "pointer-events-auto" : "pointer-events-none")}>
          <div
            className={cn("absolute inset-0 bg-slate-900/50 transition-opacity", menuOpen ? "opacity-100" : "opacity-0")}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl transition-transform",
              menuOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label={t("common.close")}
              className="absolute top-5 right-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setMenuOpen(true)} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
