import { useState, type ComponentType, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  ChevronRight,
  CircleCheck,
  Clock,
  DatabaseBackup,
  IndianRupee,
  MoonStar,
  PackagePlus,
  ReceiptText,
  Search,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { getAttentionItems, getBackupStatus, getTodaySummary } from "@/data/dashboard";
import type { AttentionItem } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";

type Icon = ComponentType<{ className?: string }>;

function ActionTile({ to, icon: TileIcon, label, hint, primary }: { to: string; icon: Icon; label: string; hint: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex min-h-36 flex-col justify-between rounded-2xl p-4 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:p-5",
        primary
          ? "bg-brand-800 text-white hover:bg-brand-900"
          : "border border-slate-200 bg-white text-slate-900 hover:border-brand-300 hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-xl",
          primary ? "bg-white/15 text-white" : "bg-brand-50 text-brand-800",
        )}
      >
        <TileIcon className="size-6" />
      </span>
      <span className="mt-4 block">
        <span className="block text-lg leading-snug font-bold">{label}</span>
        <span className={cn("mt-0.5 block text-sm", primary ? "text-brand-100" : "text-slate-500")}>{hint}</span>
      </span>
    </Link>
  );
}

function attentionRow(item: AttentionItem, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (item.kind) {
    case "warranty_registration":
      return {
        icon: ShieldCheck,
        tone: "amber",
        to: "/warranty",
        text: t("home.attention.warrantyRegistration", { count: item.count, brands: item.brands.join(", ") }),
      };
    case "low_stock":
      return { icon: TriangleAlert, tone: "amber", to: "/stock", text: t("home.attention.lowStock", { count: item.count }) };
    case "complaint":
      return { icon: Wrench, tone: "slate", to: "/warranty", text: t("home.attention.complaint", { count: item.count }) };
    case "bajaj_pending":
      return {
        icon: IndianRupee,
        tone: "slate",
        to: "/payments/new",
        text: t("home.attention.bajajPending", { amount: formatRupees(item.amountPaise) }),
      };
    case "old_stock":
      return { icon: Clock, tone: "slate", to: "/stock", text: t("home.attention.oldStock", { count: item.count }) };
  }
}

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const today = useAsync(getTodaySummary);
  const attention = useAsync(getAttentionItems);
  const backup = useAsync(getBackupStatus);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate("/search", { state: { q: query.trim() } });
  };

  return (
    <div className="flex flex-col gap-6">
      <form role="search" onSubmit={onSearch}>
        <label className="relative block">
          <span className="sr-only">{t("home.search")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("home.searchPlaceholder")}
            className="h-14 w-full rounded-2xl border border-slate-300 bg-white pr-4 pl-13 text-[17px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </label>
      </form>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <ActionTile to="/bills/new" icon={ReceiptText} label={t("home.newBill")} hint={t("home.newBillHint")} primary />
        <ActionTile
          to="/payments/new"
          icon={IndianRupee}
          label={t("home.paymentReceived")}
          hint={t("home.paymentReceivedHint")}
        />
        <ActionTile to="/purchases/new" icon={PackagePlus} label={t("home.newStock")} hint={t("home.newStockHint")} />
        <ActionTile to="/warranty" icon={ShieldCheck} label={t("home.warrantyCheck")} hint={t("home.warrantyCheckHint")} />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t("home.today")}</p>
          {today.loading || !today.data ? (
            <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {formatRupees(today.data.salesPaise, { paise: "never" })}
                </span>
                <span className="text-[15px] font-medium text-slate-500">
                  {t("home.billCount", { count: today.data.billCount })}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                {today.data.byMode.map((m) => (
                  <div key={m.mode}>
                    <dt className="text-sm text-slate-500">{t(`modes.${m.mode}`)}</dt>
                    <dd className="text-lg font-semibold text-emerald-700 tabular-nums">
                      {formatRupees(m.paise, { paise: "never" })}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt className="text-sm text-slate-500">{t("home.udhaarGiven")}</dt>
                  <dd className="text-lg font-semibold text-red-600 tabular-nums">
                    {formatRupees(today.data.udhaarPaise, { paise: "never" })}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title={t("home.needsAttention")} icon={TriangleAlert} />
          {attention.loading ? (
            <div className="space-y-3 p-5">
              <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : (attention.data ?? []).length === 0 ? (
            <p className="flex items-center gap-2 px-6 py-6 text-[15px] text-slate-600">
              <CircleCheck className="size-5 text-emerald-600" />
              {t("home.allClear")}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(attention.data ?? []).map((item) => {
                const row = attentionRow(item, t);
                return (
                  <li key={item.kind}>
                    <Link
                      to={row.to}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 sm:px-6"
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          row.tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        <row.icon className="size-5" />
                      </span>
                      <span className="flex-1 text-[15px] font-medium text-slate-800">{row.text}</span>
                      <ChevronRight className="size-5 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <Card className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2.5 text-[15px] font-medium">
          {backup.data?.state === "done" ? (
            <>
              <CircleCheck className="size-5 text-emerald-600" />
              <span className="text-emerald-800">
                {t("home.backupSaved", { time: formatTime(backup.data.at, i18n.language) })}
              </span>
            </>
          ) : backup.data?.state === "missing" ? (
            <>
              <TriangleAlert className="size-5 text-red-600" />
              <span className="text-red-700">{t("home.backupMissing")}</span>
            </>
          ) : (
            <>
              <DatabaseBackup className="size-5 text-slate-400" />
              <span className="text-slate-500">{t("home.backupNotSetUp")}</span>
            </>
          )}
        </p>
        <LinkButton to="/close-day" variant="secondary" icon={MoonStar}>
          {t("home.closeDay")}
        </LinkButton>
      </Card>
    </div>
  );
}
