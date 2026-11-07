import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

/** The shop's logo mark + name. */
export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-900 shadow-sm">
        <Zap className="size-5 fill-amber-400 text-amber-400" />
      </span>
      <div className="leading-tight">
        <div className={cn("text-[17px] font-bold tracking-tight", inverted ? "text-white" : "text-slate-900")}>
          {t("brand.name")}
        </div>
        <div className={cn("text-xs font-medium", inverted ? "text-brand-200" : "text-slate-500")}>
          {t("brand.place")}
        </div>
      </div>
    </div>
  );
}
