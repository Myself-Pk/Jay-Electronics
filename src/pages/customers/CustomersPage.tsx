import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, IndianRupee, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/auth/LoginScreen";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { listCustomerDues } from "@/data/payments";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { formatPhone } from "../bills/CustomerSection";

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const customers = useAsync(listCustomerDues);
  const [query, setQuery] = useState("");
  const [udhaarOnly, setUdhaarOnly] = useState(false);

  const all = customers.data ?? [];
  const total = all.reduce((sum, c) => sum + c.dues, 0);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return all
      .filter((c) => !udhaarOnly || c.dues > 0)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone ?? "").includes(digits)) || c.area.toLowerCase().includes(q))
      .sort((a, b) => (udhaarOnly ? b.dues - a.dues : 0) || a.name.localeCompare(b.name));
  }, [all, query, udhaarOnly]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("customers.title")}</h1>
          <p className="mt-1 text-[15px] text-slate-500">{t("customers.subtitle")}</p>
        </div>
        <LinkButton to="/payments/new" icon={IndianRupee} size="lg">
          {t("customers.receive")}
        </LinkButton>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-64 flex-1">
          <span className="sr-only">{t("customers.search")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("customers.search")}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-11 text-[15px] shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setUdhaarOnly((v) => !v)}
          className={cn(
            "h-12 rounded-xl border px-4 text-[15px] font-semibold transition-colors",
            udhaarOnly ? "border-red-400 bg-red-50 text-red-700" : "border-slate-300 bg-white text-slate-700 hover:border-red-300",
          )}
        >
          {t("customers.udhaarOnly")}
        </button>
      </div>

      <Card>
        {customers.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Users className="size-10 text-slate-300" />
            <p className="text-[15px] text-slate-600">{all.length === 0 ? t("customers.empty") : t("customers.noMatch")}</p>
          </div>
        ) : (
          <>
            <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 sm:px-6">
              {t("customers.totalUdhaar", { amount: formatRupees(total) })}
            </p>
            <ul className="divide-y divide-slate-100">
              {shown.map((c, i) => (
                <li key={c.id}>
                  <Link to={`/customers/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 sm:px-6">
                    <Avatar name={c.name} index={i} className="size-10 text-base" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">
                        {c.name}
                        {c.type === "dealer" ? <Badge tone="brand" className="ml-2 align-middle">{t("newBill.dealer")}</Badge> : null}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {[c.phone ? formatPhone(c.phone) : null, c.area || null, t("customers.bills", { count: c.billCount })]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {c.dues > 0 ? (
                      <span className="text-right">
                        <span className="block text-[16px] font-bold text-red-600 tabular-nums">{formatRupees(c.dues)}</span>
                        {c.oldestDue ? (
                          <span className="block text-xs text-slate-500">{t("customers.since", { date: formatDate(c.oldestDue, i18n.language) })}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">{t("customers.noUdhaar")}</span>
                    )}
                    <ChevronRight className="size-5 shrink-0 text-slate-400" />
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
