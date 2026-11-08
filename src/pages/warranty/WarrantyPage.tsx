import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { BadgeCheck, CircleCheck, History, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { markWarrantyRegistered } from "@/data/bills";
import { asBillError } from "@/data/errors";
import { listPendingRegistrations, searchWarranty, type WarrantyUnit } from "@/data/warranty";
import { formatDate, todayISO } from "@/lib/dates";
import { useAsync } from "@/lib/useAsync";
import { isOverdueRegistration } from "@/lib/warranty";
import { formatPhone } from "../bills/CustomerSection";
import { OldSaleDialog } from "./OldSaleDialog";
import { UnitCard } from "./UnitCard";

/** Warranty Check: one box finds any battery; below it, sales still to be registered with the brand. */
export function WarrantyPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const query = params.get("q") ?? "";
  const [version, setVersion] = useState(0);
  const results = useAsync(() => searchWarranty(query), [query, version]);
  const pending = useAsync(listPendingRegistrations, [version]);
  const [marking, setMarking] = useState<WarrantyUnit | null>(null);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [oldOpen, setOldOpen] = useState(false);
  const today = todayISO();

  // Search a moment after typing stops (a barcode scanner's Enter searches at once).
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (text.trim() !== query) setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
    }, 350);
    return () => window.clearTimeout(id);
  }, [text, query, setParams]);

  const reload = () => setVersion((v) => v + 1);

  const openMark = (unit: WarrantyUnit) => {
    setMarking(unit);
    setReference("");
  };

  const saveMark = async () => {
    if (!marking) return;
    setSaving(true);
    try {
      await markWarrantyRegistered(marking.unitId, reference.trim());
      toast(t("warranty.marked"));
      setMarking(null);
      reload();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  const list = results.data ?? [];
  const pendingList = pending.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
            <ShieldCheck className="size-7 text-brand-800" />
            {t("warranty.title")}
          </h1>
          <p className="mt-1 text-[15px] text-slate-500">{t("warranty.subtitle")}</p>
        </div>
        <Button variant="secondary" icon={History} onClick={() => setOldOpen(true)}>
          {t("warranty.addOld")}
        </Button>
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
        }}
      >
        <label className="relative block">
          <span className="sr-only">{t("warranty.searchPlaceholder")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("warranty.searchPlaceholder")}
            autoComplete="off"
            className="h-14 w-full rounded-2xl border border-slate-300 bg-white pr-4 pl-13 text-[17px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </label>
        <p className="mt-2 px-1 text-sm text-slate-500">{t("warranty.searchHint")}</p>
      </form>

      {query ? (
        results.loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
        ) : list.length === 0 ? (
          <Card className="px-6 py-6">
            <p className="text-[17px] font-semibold text-slate-800">{t("warranty.noResults", { q: query })}</p>
            <p className="mt-1 text-[15px] text-slate-500">{t("warranty.noResultsHint")}</p>
            <Button variant="secondary" icon={History} className="mt-4" onClick={() => setOldOpen(true)}>
              {t("warranty.addOld")}
            </Button>
          </Card>
        ) : (
          <section className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-slate-500">{t("warranty.results", { count: list.length })}</p>
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {list.map((u) => (
                <UnitCard key={u.unitId} unit={u} today={today} onMark={openMark} />
              ))}
            </ul>
          </section>
        )
      ) : null}

      <Card>
        <CardHeader title={t("warranty.pendingTitle")} description={t("warranty.pendingHint")} icon={BadgeCheck} />
        {pending.loading ? (
          <div className="m-5 h-16 animate-pulse rounded-xl bg-slate-100" />
        ) : pendingList.length === 0 ? (
          <p className="flex items-center gap-2 px-6 py-5 text-[15px] text-slate-600">
            <CircleCheck className="size-5 text-emerald-600" />
            {t("warranty.pendingNone")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingList.map((u) => {
              const overdue = isOverdueRegistration(u.soldOn, today);
              return (
                <li key={u.unitId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-slate-900">{u.product}</span>
                      {overdue ? <Badge tone="red">{t("warranty.overdue")}</Badge> : null}
                    </span>
                    <span className="block font-mono text-sm text-slate-600">{u.serial}</span>
                    <span className="block text-sm text-slate-500">
                      {[u.customerName, u.customerPhone ? formatPhone(u.customerPhone) : null, u.soldOn ? t("warranty.soldOn", { date: formatDate(u.soldOn, i18n.language) }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Button size="sm" variant={overdue ? "primary" : "secondary"} icon={BadgeCheck} onClick={() => openMark(u)}>
                    {t("warranty.mark")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog
        open={marking !== null}
        onClose={() => setMarking(null)}
        size="sm"
        title={marking ? t("warranty.markTitle", { brand: marking.brand ?? "" }) : ""}
        description={marking ? `${marking.product} · ${marking.serial}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setMarking(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="lg" icon={BadgeCheck} loading={saving} onClick={() => void saveMark()}>
              {t("warranty.mark")}
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <Field label={t("warranty.refLabel")} htmlFor="reg-ref" hint={t("warranty.refHint")} optional={t("common.optional")}>
            <Input id="reg-ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} data-autofocus />
          </Field>
        </div>
      </Dialog>

      <OldSaleDialog
        open={oldOpen}
        onClose={() => setOldOpen(false)}
        onSaved={(serial) => {
          setText(serial);
          setParams({ q: serial }, { replace: true });
          reload();
        }}
      />
    </div>
  );
}
