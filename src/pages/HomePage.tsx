import { useState, type ComponentType, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  ChartColumn,
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
  Trophy,
  TriangleAlert,
  Wallet,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { getAttentionItems, getBackupStatus, getDashboardSummary, getTodaySummary } from "@/data/dashboard";
import type { AttentionItem } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { SalesChart } from "./home/SalesChart";

type Icon = ComponentType<{ className?: string }>;
type T = (key: string, options?: Record<string, unknown>) => string;

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
      <span className={cn("flex size-12 items-center justify-center rounded-xl", primary ? "bg-white/15 text-white" : "bg-brand-50 text-brand-800")}>
        <TileIcon className="size-6" />
      </span>
      <span className="mt-4 block">
        <span className="block text-lg leading-snug font-bold">{label}</span>
        <span className={cn("mt-0.5 block text-sm", primary ? "text-brand-100" : "text-slate-500")}>{hint}</span>
      </span>
    </Link>
  );
}

/** "▲ 12% vs same days last week" — or nothing if there's nothing to compare with. */
function Change({ now, before, kind, t }: { now: number; before: number; kind: "week" | "month"; t: T }) {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span>{t(`home.${kind}Same`)}</span>;
  return (
    <span className={pct > 0 ? "font-medium text-emerald-700" : "font-medium text-red-600"}>
      {t(`home.${kind}${pct > 0 ? "Up" : "Down"}`, { pct: Math.abs(pct) })}
    </span>
  );
}

function attentionRow(item: AttentionItem, t: T) {
  switch (item.kind) {
    case "warranty_registration":
      return { icon: ShieldCheck, tone: "amber", to: "/warranty", text: t("home.attention.warrantyRegistration", { count: item.count, brands: item.brands.join(", ") }) };
    case "low_stock":
      return { icon: TriangleAlert, tone: "amber", to: "/stock", text: t("home.attention.lowStock", { count: item.count }) };
    case "complaint":
      return { icon: Wrench, tone: "slate", to: "/warranty", text: t("home.attention.complaint", { count: item.count }) };
    case "bajaj_pending":
      return { icon: IndianRupee, tone: "slate", to: "/payments/new?tab=bajaj", text: t("home.attention.bajajPending", { amount: formatRupees(item.amountPaise) }) };
    case "old_stock":
      return { icon: Clock, tone: "slate", to: "/stock", text: t("home.attention.oldStock", { count: item.count }) };
  }
}

export function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { person } = useSession();
  const [query, setQuery] = useState("");
  const today = useAsync(getTodaySummary);
  const summary = useAsync(() => getDashboardSummary(person?.role), [person?.role]);
  const attention = useAsync(getAttentionItems);
  const backup = useAsync(getBackupStatus);
  const s = summary.data;

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
        <ActionTile to="/payments/new" icon={IndianRupee} label={t("home.paymentReceived")} hint={t("home.paymentReceivedHint")} />
        <ActionTile to="/purchases/new" icon={PackagePlus} label={t("home.newStock")} hint={t("home.newStockHint")} />
        <ActionTile to="/warranty" icon={ShieldCheck} label={t("home.warrantyCheck")} hint={t("home.warrantyCheckHint")} />
      </section>

      {/* Sales at a glance */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label={t("home.today")}
          value={today.data ? formatRupees(today.data.salesPaise, { paise: "never" }) : null}
          sub={today.data ? t("home.billCount", { count: today.data.billCount }) : null}
        />
        <StatTile
          label={t("home.week")}
          value={s ? formatRupees(s.week, { paise: "never" }) : null}
          sub={
            s ? (
              <>
                <span className="block">{t("home.billCount", { count: s.weekBills })}</span>
                <Change now={s.week} before={s.prevWeek} kind="week" t={t} />
              </>
            ) : null
          }
        />
        <StatTile
          label={t("home.month")}
          value={s ? formatRupees(s.month, { paise: "never" }) : null}
          sub={
            s ? (
              <>
                <span className="block">{t("home.billCount", { count: s.monthBills })}</span>
                <Change now={s.month} before={s.prevMonth} kind="month" t={t} />
                {s.profit !== null ? (
                  <span className="mt-1 block font-semibold text-emerald-700">{t("home.profit", { amount: formatRupees(s.profit, { paise: "never" }) })}</span>
                ) : null}
              </>
            ) : null
          }
        />
        <StatTile
          label={t("home.udhaarTotal")}
          value={s ? formatRupees(s.udhaar, { paise: "never" }) : null}
          tone={s && s.udhaar > 0 ? "red" : undefined}
          sub={s ? t("home.customers", { count: s.udhaarCustomers }) : null}
          to="/customers"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t("home.last7")} icon={ChartColumn} />
          <div className="px-5 pt-3 pb-4 sm:px-6">
            {s ? <SalesChart days={s.days} /> : <div className="h-52 animate-pulse rounded-xl bg-slate-100" />}
          </div>
        </Card>

        <Card className="lg:col-span-2">
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
                    <Link to={row.to} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50 sm:px-6">
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", row.tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title={t("home.todayMoney")} icon={Wallet} />
          {today.loading || !today.data ? (
            <div className="m-5 h-20 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
              {today.data.byMode.map((m) => (
                <div key={m.mode}>
                  <dt className="text-sm text-slate-500">{t(`modes.${m.mode}`)}</dt>
                  <dd className="text-lg font-semibold text-emerald-700 tabular-nums">{formatRupees(m.paise, { paise: "never" })}</dd>
                </div>
              ))}
              <div>
                <dt className="text-sm text-slate-500">{t("home.udhaarGiven")}</dt>
                <dd className="text-lg font-semibold text-red-600 tabular-nums">{formatRupees(today.data.udhaarPaise, { paise: "never" })}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title={t("home.topSellers")} icon={Trophy} />
          {!s ? (
            <div className="m-5 h-20 animate-pulse rounded-xl bg-slate-100" />
          ) : s.top.length === 0 ? (
            <p className="px-6 py-5 text-[15px] text-slate-500">{t("home.noSales")}</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {s.top.map((p, i) => (
                <li key={p.product} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-slate-800">{p.product}</span>
                    <span className="block text-sm text-slate-500">{t("home.sold", { count: p.qty })}</span>
                  </span>
                  <span className="shrink-0 text-right font-semibold text-slate-900 tabular-nums">{formatRupees(p.amount, { paise: "never" })}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>

      <Card className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2.5 text-[15px] font-medium">
          {backup.data?.state === "done" ? (
            <>
              <CircleCheck className="size-5 text-emerald-600" />
              <span className="text-emerald-800">{t("home.backupSaved", { time: formatTime(backup.data.at, i18n.language) })}</span>
            </>
          ) : backup.data?.state === "missing" ? (
            <>
              <TriangleAlert className="size-5 text-red-600" />
              <span className="text-red-700">{t("home.backupMissing", { date: formatDate(new Date(backup.data.lastAt), i18n.language) })}</span>
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
