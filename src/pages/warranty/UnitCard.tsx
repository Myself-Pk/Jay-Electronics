import { Link } from "react-router";
import { BadgeCheck, ShieldAlert, ShieldCheck, ShieldOff, ShieldQuestion, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { WarrantyUnit } from "@/data/warranty";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { isOverdueRegistration, timeLeft, warrantyStatus } from "@/lib/warranty";
import { formatPhone } from "../bills/CustomerSection";

type T = (key: string, options?: Record<string, unknown>) => string;

/** "3 years 11 months left", "20 days left" or "Last day today". */
export function leftText(t: T, today: string, until: string): string | null {
  const left = timeLeft(today, until);
  if (!left) return null;
  if (left.years === 0 && left.months === 0) {
    return left.days === 0 ? t("warranty.lastDay") : t("warranty.left", { time: t("warranty.days", { count: left.days }) });
  }
  const parts = [];
  if (left.years) parts.push(t("warranty.years", { count: left.years }));
  if (left.months) parts.push(t("warranty.months", { count: left.months }));
  return t("warranty.left", { time: parts.join(" ") });
}

/** One battery: the warranty answer in big letters, then who bought it and the brand registration. */
export function UnitCard({ unit, today, onMark }: { unit: WarrantyUnit; today: string; onMark: (unit: WarrantyUnit) => void }) {
  const { t, i18n } = useTranslation();
  const date = (iso: string) => formatDate(iso, i18n.language);
  const sold = unit.status === "sold";
  const w = sold ? warrantyStatus(unit.warrantyStart, unit.freeMonths, unit.prorataMonths, today) : null;

  const tone = !sold
    ? "slate"
    : w?.state === "free"
      ? "green"
      : w?.state === "prorata"
        ? "amber"
        : "slate";
  const Icon = !sold ? (unit.status === "in_stock" ? Store : ShieldQuestion) : w?.state === "free" || w?.state === "prorata" ? ShieldCheck : ShieldOff;
  const headline = !sold
    ? t(unit.status === "in_stock" ? "warranty.state.inStock" : unit.status === "replaced" ? "warranty.state.replaced" : "warranty.state.other")
    : t(`warranty.state.${w!.state}`);
  const detail =
    w?.state === "free" || w?.state === "prorata"
      ? [leftText(t, today, w.until), t("warranty.until", { date: date(w.until) })].filter(Boolean).join(" · ")
      : w?.state === "expired"
        ? t("warranty.endedOn", { date: date(w.endedOn) })
        : null;

  return (
    <li
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
        tone === "green" ? "border-emerald-200" : tone === "amber" ? "border-amber-200" : "border-slate-200",
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3 px-5 py-4 sm:px-6",
          tone === "green" ? "bg-emerald-50" : tone === "amber" ? "bg-amber-50" : "bg-slate-50",
        )}
      >
        <Icon className={cn("mt-0.5 size-7 shrink-0", tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-slate-400")} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-xl font-bold", tone === "green" ? "text-emerald-800" : tone === "amber" ? "text-amber-900" : "text-slate-700")}>
            {headline}
          </p>
          {detail ? <p className="text-[15px] font-medium text-slate-700">{detail}</p> : null}
          {w?.state === "free" && w.prorataUntil ? (
            <p className="text-sm text-slate-600">{t("warranty.thenProrata", { date: date(w.prorataUntil) })}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[17px] font-semibold text-slate-900">{unit.product}</p>
          <p className="font-mono text-[15px] text-slate-600">{unit.serial}</p>
        </div>
        {sold ? (
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-[15px] text-slate-600">
            {unit.soldOn ? <span>{t("warranty.soldOn", { date: date(unit.soldOn) })}</span> : null}
            {unit.billId && unit.billNumber ? (
              <Link to={`/bills/${unit.billId}`} className="font-medium text-brand-800 hover:underline">
                · {t("warranty.billLabel", { number: unit.billNumber })}
              </Link>
            ) : unit.source === "old_register" ? (
              <span>· {t("warranty.oldRegister")}</span>
            ) : null}
          </p>
        ) : null}
        {sold ? (
          <p className="text-[15px]">
            {unit.customerId ? (
              <Link to={`/customers/${unit.customerId}`} className="font-semibold text-brand-800 hover:underline">
                {unit.customerName}
              </Link>
            ) : (
              <span className="font-semibold text-slate-800">{unit.customerName || t("warranty.walkIn")}</span>
            )}
            {unit.customerPhone ? <span className="text-slate-500"> · {formatPhone(unit.customerPhone)}</span> : null}
          </p>
        ) : null}

        {sold && unit.needsRegistration ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {unit.registeredAt ? (
              <Badge tone="green" className="text-sm">
                <BadgeCheck className="size-4" />
                {unit.regRef
                  ? t("warranty.registeredRef", { brand: unit.brand ?? "", ref: unit.regRef })
                  : t("warranty.registered", { brand: unit.brand ?? "" })}
              </Badge>
            ) : (
              <>
                <Badge tone={isOverdueRegistration(unit.soldOn, today) ? "red" : "amber"} className="text-sm">
                  <ShieldAlert className="size-4" />
                  {t("warranty.notRegistered", { brand: unit.brand ?? "" })}
                </Badge>
                <Button size="sm" variant="secondary" icon={BadgeCheck} onClick={() => onMark(unit)} className="ml-auto">
                  {t("warranty.mark")}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}
