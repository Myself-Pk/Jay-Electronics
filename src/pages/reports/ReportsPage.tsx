import { useMemo, useState } from "react";
import { ChartColumn, ChartNoAxesColumn, Download, Landmark, Receipt, Tag, Trophy, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatTile } from "@/components/ui/StatTile";
import { getReport, getSalesSince } from "@/data/reports";
import { getSettings } from "@/data/settings";
import { cn } from "@/lib/cn";
import { formatDate, todayISO } from "@/lib/dates";
import { formatPercent, formatRupees, fromPaise } from "@/lib/money";
import {
  billsCsv,
  COMPOSITION_LIMIT,
  compositionTax,
  OTHER,
  presetRange,
  quarterOf,
  RANGE_KEYS,
  type Breakdown,
  type RangeKey,
} from "@/lib/report";
import { useAsync } from "@/lib/useAsync";
import { MODE_ICONS } from "../bills/PaymentSection";
import { SalesChart } from "../home/SalesChart";

type T = (key: string, options?: Record<string, unknown>) => string;

/** A list of names with a thin bar showing each one's share (one colour: it's one measure). */
function BarList({ rows, t, showQty = true, limit = 8 }: { rows: Breakdown[]; t: T; showQty?: boolean; limit?: number }) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  if (rows.length === 0) return <p className="px-6 py-5 text-[15px] text-slate-500">{t("reports.nothing")}</p>;
  return (
    <ul className="flex flex-col gap-3 px-5 py-4 sm:px-6">
      {rows.slice(0, limit).map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-800">{r.name === OTHER ? t("reports.other") : r.name}</span>
            <span className="shrink-0 text-right font-semibold text-slate-900 tabular-nums">{formatRupees(r.amount, { paise: "never" })}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-2 min-w-0 flex-1 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-brand-700" style={{ width: `${Math.max((r.amount / max) * 100, 1)}%` }} />
            </div>
            {showQty ? <span className="shrink-0 text-sm text-slate-500">{t("reports.sold", { count: r.qty })}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Composition GST helper: this quarter's tax and the yearly ₹1.5 crore limit. */
function GstCard({ rate, t, lang }: { rate: number; t: T; lang: string }) {
  const today = todayISO();
  const quarter = quarterOf(today);
  const fyStart = presetRange("year", today).from;
  const sales = useAsync(() => getSalesSince(fyStart), [fyStart]);
  const q = sales.data ? compositionTax(sales.data.filter((b) => b.date >= quarter.from), rate) : null;
  const year = sales.data ? compositionTax(sales.data, rate).turnover : null;
  const share = year === null ? 0 : Math.min(year / COMPOSITION_LIMIT, 1);

  return (
    <Card>
      <CardHeader title={t("reports.gst")} description={t("reports.gstQuarter", { from: formatDate(quarter.from, lang), to: formatDate(quarter.to, lang) })} icon={Landmark} />
      <CardBody className="flex flex-col gap-5">
        {q === null || year === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">{t("reports.gstSales")}</dt>
                <dd className="text-xl font-bold text-slate-900 tabular-nums">{formatRupees(q.turnover, { paise: "never" })}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">{t("reports.gstTax", { rate: formatPercent(rate) })}</dt>
                <dd className="text-xl font-bold text-slate-900 tabular-nums">{formatRupees(q.tax)}</dd>
              </div>
            </dl>
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-900">{t("reports.gstDue", { date: formatDate(quarter.due, lang) })}</p>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">{t("reports.limit")}</span>
                <span className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-900 tabular-nums">{formatRupees(year, { paise: "never" })}</span> {t("reports.limitOf")}
                </span>
              </div>
              <div
                className="mt-2 h-3 rounded-full bg-slate-100"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)}
                aria-label={t("reports.limit")}
              >
                <div className={cn("h-3 rounded-full", share >= 0.8 ? "bg-amber-500" : "bg-brand-700")} style={{ width: `${Math.max(share * 100, 1)}%` }} />
              </div>
              {share >= 0.8 ? <p className="mt-2 text-sm font-medium text-amber-800">{t("reports.limitNear")}</p> : null}
            </div>
            <p className="text-sm text-slate-500">{t("reports.gstNote")}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { person } = useSession();
  const [preset, setPreset] = useState<RangeKey | "custom">("month");
  const today = todayISO();
  const [custom, setCustom] = useState(() => presetRange("month", today));
  const range = preset === "custom" ? custom : presetRange(preset, today);
  const badRange = range.from > range.to;
  const data = useAsync(
    () => (badRange ? Promise.resolve(undefined) : getReport(range.from, range.to, person?.role)),
    [range.from, range.to, person?.role],
  );
  const settings = useAsync(getSettings);
  const r = data.loading ? undefined : data.data?.report;
  const lang = i18n.language;

  const csvName = useMemo(() => `bills_${range.from}_to_${range.to}.csv`, [range.from, range.to]);
  const onDownload = () => {
    if (!data.data) return;
    download(
      csvName,
      billsCsv(data.data.bills, t("reports.csvHeaders").split(","), (s) => (s === "saved" ? t("reports.csvSaved") : t("reports.csvCancelled"))),
    );
  };

  const choices: (RangeKey | "custom")[] = [...RANGE_KEYS, "custom"];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <ChartNoAxesColumn className="size-7 text-brand-800" />
          {t("reports.title")}
        </h1>
        <Button variant="secondary" icon={Download} disabled={!data.data || data.data.bills.length === 0} onClick={onDownload}>
          {t("reports.download")}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {/* One swipeable row on phones; wraps on wider screens. */}
        <div role="radiogroup" aria-label={t("reports.rangeLabel")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {choices.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={preset === key}
              onClick={() => {
                if (key === "custom") setCustom(range);
                setPreset(key);
              }}
              className={cn(
                "min-h-11 shrink-0 rounded-xl border px-4 text-[15px] font-semibold whitespace-nowrap transition-colors",
                preset === key ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300",
              )}
            >
              {t(`reports.range.${key}`)}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="flex flex-wrap items-start gap-3">
            <Field label={t("reports.from")} htmlFor="rep-from" className="w-48">
              <Input id="rep-from" type="date" max={today} value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
            </Field>
            <Field label={t("reports.to")} htmlFor="rep-to" className="w-48" error={badRange ? t("reports.badRange") : undefined}>
              <Input id="rep-to" type="date" max={today} value={custom.to} invalid={badRange} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
            </Field>
          </div>
        ) : (
          <p className="text-[15px] text-slate-500">
            {range.from === range.to ? formatDate(range.from, lang) : `${formatDate(range.from, lang)} – ${formatDate(range.to, lang)}`}
          </p>
        )}
      </div>

      {badRange ? null : (
        <>
          <section className={cn("grid grid-cols-2 gap-3 sm:gap-4", r?.profit != null ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
            <StatTile
              label={t("reports.sales")}
              value={r ? formatRupees(r.sales, { paise: "never" }) : null}
              sub={
                r ? (
                  <>
                    <span className="block">{t("reports.bills", { count: r.billCount })}</span>
                    {r.billCount > 0 ? <span className="block">{t("reports.average", { amount: formatRupees(r.averageBill, { paise: "never" }) })}</span> : null}
                  </>
                ) : null
              }
            />
            <StatTile
              label={t("reports.moneyIn")}
              tone="green"
              value={r ? formatRupees(r.moneyIn.filter((m) => m.mode !== "bajaj").reduce((s, m) => s + m.amount, 0), { paise: "never" }) : null}
              sub={r && r.udhaarCollected > 0 ? t("reports.udhaarCollected", { amount: formatRupees(r.udhaarCollected, { paise: "never" }) }) : null}
            />
            <StatTile
              label={t("reports.udhaarGiven")}
              value={r ? formatRupees(r.udhaarGiven, { paise: "never" }) : null}
              tone={r && r.udhaarGiven > 0 ? "red" : undefined}
            />
            <StatTile label={t("reports.expenses")} value={r ? formatRupees(r.expensesTotal, { paise: "never" }) : null} />
            {r?.profit != null ? (
              <div className="col-span-2 lg:col-span-1">
                <StatTile
                  label={t("reports.profit")}
                  tone="green"
                  value={formatRupees(r.profit, { paise: "never" })}
                  sub={
                    <>
                      <span className="block">{t("reports.profitHint")}</span>
                      <span className="block font-medium text-slate-700">{t("reports.afterExpenses", { amount: formatRupees(r.profit - r.expensesTotal, { paise: "never" }) })}</span>
                    </>
                  }
                />
              </div>
            ) : null}
          </section>

          {r && r.days.length > 1 ? (
            <Card>
              <CardHeader title={r.days.length > 31 ? t("reports.salesByMonth") : t("reports.salesByDay")} icon={ChartColumn} />
              <div className="px-5 pt-3 pb-4 sm:px-6">
                <SalesChart days={r.days} variant="range" caption={r.days.length > 31 ? t("reports.salesByMonth") : t("reports.salesByDay")} />
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t("reports.topProducts")} icon={Trophy} />
              {r ? <BarList rows={r.topProducts} t={t} limit={10} /> : <div className="m-5 h-32 animate-pulse rounded-xl bg-slate-100" />}
            </Card>

            <Card>
              <CardHeader title={t("reports.byBrand")} icon={Tag} />
              {r ? <BarList rows={r.byBrand} t={t} /> : <div className="m-5 h-32 animate-pulse rounded-xl bg-slate-100" />}
            </Card>

            <Card>
              <CardHeader title={t("reports.money")} icon={Wallet} />
              {!r ? (
                <div className="m-5 h-24 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                <>
                  {r.moneyIn.length === 0 ? (
                    <p className="px-6 py-5 text-[15px] text-slate-500">{t("reports.nothing")}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {r.moneyIn.map((m) => {
                        const Icon = MODE_ICONS[m.mode];
                        return (
                          <li key={m.mode} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                              <Icon className="size-5" />
                            </span>
                            <span className="flex-1">
                              <span className="block text-[15px] font-medium text-slate-800">{t(`modes.${m.mode}`)}</span>
                              {m.mode === "bajaj" ? <span className="block text-sm text-slate-500">{t("reports.bajajLater")}</span> : null}
                            </span>
                            <span className={cn("font-semibold tabular-nums", m.mode === "bajaj" ? "text-slate-500" : "text-emerald-700")}>
                              {formatRupees(m.amount, { paise: "never" })}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm text-slate-600 sm:px-6">
                    {r.serviceSales > 0 ? <p>{t("reports.services", { amount: formatRupees(r.serviceSales, { paise: "never" }) })}</p> : null}
                    {r.scrapValue > 0 ? (
                      <p>{t("reports.scrap", { kg: fromPaise(r.scrapCentiKg).replace(/\.00$/, ""), amount: formatRupees(r.scrapValue, { paise: "never" }) })}</p>
                    ) : null}
                    {r.moneyOutTotal > 0 ? <p>{t("reports.refunds", { amount: formatRupees(r.moneyOutTotal) })}</p> : null}
                    {r.cancelledCount > 0 ? (
                      <p className="text-amber-700">{t("reports.cancelled", { count: r.cancelledCount, amount: formatRupees(r.cancelledAmount) })}</p>
                    ) : null}
                  </div>
                </>
              )}
            </Card>

            <Card>
              <CardHeader title={t("reports.expensesByKind")} icon={Receipt} />
              {!r ? (
                <div className="m-5 h-24 animate-pulse rounded-xl bg-slate-100" />
              ) : r.expensesByCategory.length === 0 ? (
                <p className="px-6 py-5 text-[15px] text-slate-500">{t("reports.noExpenses")}</p>
              ) : (
                <BarList
                  rows={r.expensesByCategory.map((e) => ({ name: t(`closeDay.cats.${e.name}`, { defaultValue: e.name }), qty: 0, amount: e.amount }))}
                  t={t}
                  showQty={false}
                />
              )}
            </Card>

            <Card>
              <CardHeader title={t("reports.byCategory")} icon={ChartNoAxesColumn} />
              {r ? <BarList rows={r.byCategory} t={t} showQty={false} /> : <div className="m-5 h-32 animate-pulse rounded-xl bg-slate-100" />}
            </Card>

            {settings.data?.gstScheme === "composition" ? <GstCard rate={settings.data.compositionRate} t={t} lang={lang} /> : null}
          </div>
        </>
      )}
    </div>
  );
}
