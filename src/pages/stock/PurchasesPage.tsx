import { Lock, PackagePlus, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { listPurchases } from "@/data/stock";
import { canSeeOwnerData } from "@/data/types";
import { formatDate } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";

/** Stock entries with amounts. Owner only — staff see a short note and the "New stock arrived" button. */
export function PurchasesPage() {
  const { t, i18n } = useTranslation();
  const { person } = useSession();
  const isOwner = canSeeOwnerData(person?.role);
  const purchases = useAsync(() => (isOwner ? listPurchases() : Promise.resolve([])), [isOwner]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("purchases.title")}</h1>
          <p className="mt-1 text-[15px] text-slate-500">{t("purchases.subtitle")}</p>
        </div>
        <LinkButton to="/purchases/new" icon={PackagePlus} size="lg">
          {t("stock.newStock")}
        </LinkButton>
      </div>

      <Card>
        {!isOwner ? (
          <p className="flex items-center gap-2 px-6 py-8 text-[15px] text-slate-600">
            <Lock className="size-5 text-slate-400" />
            {t("purchases.ownerOnly")}
          </p>
        ) : purchases.loading ? (
          <div className="space-y-3 p-5">
            <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : (purchases.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Truck className="size-10 text-slate-300" />
            <p className="text-[15px] text-slate-600">{t("purchases.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(purchases.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 sm:px-6">
                <span className="w-28 text-[15px] text-slate-600">{formatDate(p.billDate, i18n.language)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">
                    {p.kind === "opening_stock" ? <Badge tone="brand">{t("purchases.opening")}</Badge> : p.supplierName}
                  </span>
                  {p.supplierBillNo ? <span className="block text-sm text-slate-500">{t("purchases.billNo")} {p.supplierBillNo}</span> : null}
                </span>
                <span className="text-sm text-slate-600">{t("newStock.pieces", { count: p.itemCount })}</span>
                <span className="w-28 text-right text-[16px] font-bold text-slate-900 tabular-nums">{formatRupees(p.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
