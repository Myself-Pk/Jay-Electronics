import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Plus, Receipt, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { listBills, type BillFilter } from "@/data/bills";
import { formatDate, startOfMonthISO, startOfWeekISO, todayISO } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { billStatusBadge } from "./BillPage";
import { formatPhone } from "./CustomerSection";

type Range = "today" | "week" | "month" | "all";

function filterFor(range: Range, search: string): BillFilter {
  const today = todayISO();
  if (search) return { search }; // searching looks through every bill
  if (range === "today") return { from: today, to: today };
  if (range === "week") return { from: startOfWeekISO(), to: today };
  if (range === "month") return { from: startOfMonthISO(), to: today };
  return {};
}

export function BillsListPage() {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<Range>("today");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(typed.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [typed]);

  const bills = useAsync(() => listBills(filterFor(range, search)), [range, search]);
  const list = bills.data ?? [];
  const saved = list.filter((b) => b.status === "saved");
  const total = saved.reduce((sum, b) => sum + b.total, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("bills.title")}</h1>
          <p className="mt-1 text-[15px] text-slate-500">{t("bills.subtitle")}</p>
        </div>
        <LinkButton to="/bills/new" icon={Plus} size="lg">
          {t("bills.newBill")}
        </LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Range>
          label={t("bills.title")}
          value={range}
          onChange={(r) => {
            setRange(r);
            setTyped("");
          }}
          options={[
            { value: "today", label: t("bills.today") },
            { value: "week", label: t("bills.thisWeek") },
            { value: "month", label: t("bills.thisMonth") },
            { value: "all", label: t("bills.all") },
          ]}
        />
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">{t("bills.searchPlaceholder")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("bills.searchPlaceholder")}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-11 text-[15px] shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </label>
      </div>

      <Card>
        {bills.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Receipt className="size-10 text-slate-300" />
            <p className="text-[15px] text-slate-600">{search ? t("bills.noMatch") : t("bills.empty")}</p>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 sm:px-6">
              {t("bills.count", { count: saved.length, amount: formatRupees(total) })}
            </div>
            <div className="hidden grid-cols-[110px_150px_1fr_120px_150px_24px] gap-3 border-b border-slate-100 px-6 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase md:grid">
              <span>{t("bills.date")}</span>
              <span>{t("bills.number")}</span>
              <span>{t("bills.customer")}</span>
              <span className="text-right">{t("bills.total")}</span>
              <span>{t("bills.status")}</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100">
              {list.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/bills/${b.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-3.5 hover:bg-slate-50 sm:px-6 md:grid-cols-[110px_150px_1fr_120px_150px_24px]"
                  >
                    <span className="hidden text-[15px] text-slate-600 md:block">{formatDate(b.date, i18n.language)}</span>
                    <span className="col-start-1 row-start-1 font-mono text-[15px] font-semibold text-slate-900 md:col-start-auto md:row-start-auto">
                      {b.number}
                    </span>
                    <span className="col-span-2 min-w-0 md:col-span-1">
                      <span className={b.status === "cancelled" ? "block truncate text-slate-400 line-through" : "block truncate font-medium text-slate-800"}>
                        {b.customerName || t("newBill.walkIn")}
                      </span>
                      {b.customerPhone ? <span className="block text-sm text-slate-500">{formatPhone(b.customerPhone)}</span> : null}
                    </span>
                    <span className="col-start-2 row-start-1 text-right text-[16px] font-bold text-slate-900 tabular-nums md:col-start-auto md:row-start-auto">
                      {formatRupees(b.total)}
                    </span>
                    <span className="col-span-2 flex items-center justify-between md:col-span-1">
                      <span className="text-sm text-slate-500 md:hidden">{formatDate(b.date, i18n.language)}</span>
                      {billStatusBadge(b, t)}
                    </span>
                    <ChevronRight className="hidden size-5 text-slate-400 md:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
