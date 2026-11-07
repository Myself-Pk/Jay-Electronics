import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { PackageSearch, ReceiptText, Truck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";
import { saveBill } from "@/data/bills";
import { listCatalog, listInStockUnits, lookupSerial, searchCatalog } from "@/data/catalog";
import { asBillError } from "@/data/errors";
import { getSettings } from "@/data/settings";
import { productLabel, type CatalogProduct } from "@/data/types";
import { formatBillNumber } from "@/lib/billNumber";
import { formatRupees, paiseToInput, type Paise } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { isValidMobile } from "@/lib/validation";
import {
  defaultPrice,
  emptyDraft,
  evaluate,
  lineSerial,
  newKey,
  repriceLines,
  toSaveInput,
  type BillDraft,
  type DraftLine,
} from "./billDraft";
import { CustomerSection, formatPhone } from "./CustomerSection";
import { ItemSearch } from "./ItemSearch";
import { LineRow } from "./LineRow";
import { PaymentSection } from "./PaymentSection";
import { ScrapSection } from "./ScrapSection";

// An unfinished bill survives an accidental refresh or a quick trip to another screen.
const DRAFT_KEY = "je-bill-draft";
const loadDraft = (): BillDraft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as BillDraft) : null;
  } catch {
    return null;
  }
};
const storeDraft = (d: BillDraft) => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // ignore: just won't survive a refresh
  }
};
const clearStoredDraft = () => sessionStorage.removeItem(DRAFT_KEY);
const isBlank = (d: BillDraft) =>
  d.lines.length === 0 && d.scrap.length === 0 && d.payments.length === 0 && !d.finance && !d.customer.phone && !d.customer.name;

export function NewBillPage() {
  const { t } = useTranslation();
  const { person } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const catalogQ = useAsync(listCatalog);
  const settingsQ = useAsync(getSettings);
  const [draft, setDraft] = useState<BillDraft>(() => loadDraft() ?? emptyDraft());
  const [pendingSerial, setPendingSerial] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const restoredNotice = useRef(false);

  useEffect(() => {
    if (!restoredNotice.current && !isBlank(draft)) toast(t("newBill.draftRestored"), "info");
    restoredNotice.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => storeDraft(draft), [draft]);

  const catalog = catalogQ.data;
  const settings = settingsQ.data;
  if (!catalog || !settings) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
          <div className="h-56 animate-pulse rounded-2xl bg-white" />
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  const ev = evaluate(draft, settings, person?.role);
  const setLines = (update: (lines: DraftLine[]) => DraftLine[]) => setDraft((d) => ({ ...d, lines: update(d.lines) }));

  /** Add a product. Batteries get the oldest serial in stock, or the serial that was scanned/typed. */
  const addProduct = async (product: CatalogProduct, typedSerial: string | null = null) => {
    if (!product.hasSerial) {
      setLines((lines) => {
        const existing = product.isService ? undefined : lines.find((l) => l.product.id === product.id);
        if (existing) return lines.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
        return [
          ...lines,
          {
            key: newKey(),
            product,
            units: [],
            unitId: null,
            serial: "",
            qty: 1,
            rateText: product.retailPrice > 0 ? paiseToInput(defaultPrice(product, draft.customer.type)) : "",
            priceEdited: false,
          },
        ];
      });
      return;
    }
    const units = await listInStockUnits(product.id).catch(() => []);
    setDraft((d) => {
      const used = new Set(d.lines.map((l) => l.unitId));
      const typed = typedSerial?.toUpperCase() ?? null;
      const match = typed ? units.find((u) => u.serial.toUpperCase() === typed) : undefined;
      const unitId = typed ? (match?.id ?? null) : (units.find((u) => !used.has(u.id))?.id ?? null);
      return {
        ...d,
        lines: [
          ...d.lines,
          {
            key: newKey(),
            product,
            units,
            unitId,
            serial: typed && !match ? typed : "",
            qty: 1,
            rateText: paiseToInput(defaultPrice(product, d.customer.type)),
            priceEdited: false,
          },
        ],
      };
    });
  };

  const onPick = (product: CatalogProduct) => {
    if (pendingSerial && product.hasSerial) {
      void addProduct(product, pendingSerial);
      setPendingSerial(null);
    } else {
      void addProduct(product);
    }
  };

  /** Enter in the search box: if it looks like a serial number, look it up. */
  const onEnterText = async (text: string): Promise<boolean> => {
    if (/\s/.test(text) || !/\d/.test(text) || text.length < 4) return false;
    const found = await lookupSerial(text).catch(() => null);
    if (!found) {
      if (searchCatalog(catalog, text).length > 0) return false;
      setPendingSerial(text.toUpperCase());
      return true;
    }
    if (found.status === "sold") {
      toast(
        t("billErrors.serial_sold", { serial: found.serial, bill: found.billNumber ?? "—", customer: found.customerName ?? "—" }),
        "error",
      );
      return true;
    }
    if (found.status === "other") {
      toast(t("billErrors.serial_not_available", { serial: found.serial }), "error");
      return true;
    }
    if (draft.lines.some((l) => lineSerial(l) === found.serial.toUpperCase() || l.unitId === found.unitId)) {
      toast(t("billErrors.duplicate_serial", { serial: found.serial }), "error");
      return true;
    }
    const product = catalog.find((p) => p.id === found.productId);
    if (!product) return false;
    await addProduct(product, found.serial);
    toast(t("newBill.added", { product: productLabel(product) }), "info");
    return true;
  };

  const delivery = catalog.find((p) => p.isService && /^delivery/i.test(p.model));
  const setDelivery = (amount: Paise) => {
    if (!delivery) return;
    setLines((lines) => {
      const existing = lines.find((l) => l.product.id === delivery.id);
      if (existing) return lines.map((l) => (l === existing ? { ...l, rateText: paiseToInput(amount), priceEdited: true } : l));
      return [
        ...lines,
        { key: newKey(), product: delivery, units: [], unitId: null, serial: "", qty: 1, rateText: paiseToInput(amount), priceEdited: true },
      ];
    });
  };
  const deliveryLine = delivery ? draft.lines.find((l) => l.product.id === delivery.id) : undefined;

  const startAgain = async () => {
    if (!(await confirm({ title: t("newBill.startAgainConfirm"), confirmLabel: t("newBill.yesClear"), tone: "danger" }))) return;
    setDraft(emptyDraft());
    setPendingSerial(null);
  };

  const save = async (then: "print" | "whatsapp") => {
    if (ev.problems.length > 0 || !person) return;
    const { totals } = ev;
    const loan = ev.finance?.loanAmount ?? 0;
    const customer = draft.customer.name.trim()
      ? `${draft.customer.name.trim()}${draft.customer.phone ? ` (${formatPhone(draft.customer.phone.replace(/\D/g, "").slice(-10))})` : ""}`
      : t("newBill.walkIn");
    const stockLines = draft.lines
      .filter((l) => !l.product.isService)
      .slice(0, 4)
      .map((l) => ({ label: productLabel(l.product), value: `−${l.qty}${l.product.hasSerial ? ` · ${lineSerial(l)}` : ""}` }));
    const ok = await confirm({
      title: t("newBill.confirmTitle", { amount: formatRupees(totals.total) }),
      lines: [
        { label: t("newBill.confirmCustomer"), value: customer },
        { label: t("newBill.confirmItems"), value: t("newBill.itemsTotal", { count: draft.lines.reduce((n, l) => n + l.qty, 0) }) },
        { label: t("newBill.confirmPaid"), value: formatRupees(totals.paid - loan) },
        ...(loan > 0 ? [{ label: t("newBill.confirmBajaj"), value: formatRupees(loan) }] : []),
        ...(totals.balance > 0
          ? [{ label: t("newBill.confirmUdhaar"), value: <span className="text-red-600">{formatRupees(totals.balance)}</span> }]
          : []),
        ...stockLines,
      ],
      confirmLabel: t("newBill.confirmYes"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const result = await saveBill(toSaveInput(draft, ev), { name: person.name, role: person.role });
      clearStoredDraft();
      toast(t("newBill.saved", { number: result.number }));
      navigate(`/bills/${result.id}`, { state: { justSaved: true, then } });
    } catch (err) {
      const billError = asBillError(err);
      if (billError) toast(t(`billErrors.${billError.code}`, billError.details as Record<string, string>), "error");
      else {
        console.error(err);
        toast(t("common.somethingWrong"), "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const problemKeys = new Set(ev.problems.map((p) => p.key));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <ReceiptText className="size-7 text-brand-800" />
          {t("newBill.title")}
        </h1>
        <p className="font-mono text-[15px] text-slate-500">
          {formatBillNumber(settings.billPrefix, new Date(), Math.max(settings.nextBillNumber, 1))}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <CustomerSection
            customer={draft.customer}
            onChange={(customer, options) =>
              setDraft((d) => ({
                ...d,
                customer,
                lines: options?.typeChanged ? repriceLines(d.lines, customer.type) : d.lines,
              }))
            }
            invalid={{
              phone: problemKeys.has("bad_phone") || (problemKeys.has("customer_required") && draft.lines.length > 0),
              name: problemKeys.has("name_required"),
            }}
          />

          <Card>
            <CardHeader icon={PackageSearch} title={t("newBill.items")} />
            <div className="p-4 sm:px-6">
              <ItemSearch catalog={catalog} onPick={onPick} onEnterText={onEnterText} />
              {pendingSerial ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
                  <span className="flex-1">{t("newBill.serialUnknown", { serial: pendingSerial })}</span>
                  <Button variant="ghost" size="sm" icon={X} onClick={() => setPendingSerial(null)}>
                    {t("newBill.cancelSerial")}
                  </Button>
                </div>
              ) : null}
            </div>
            {draft.lines.length === 0 ? (
              <p className="border-t border-slate-100 px-6 py-8 text-center text-[15px] text-slate-500">{t("newBill.noItems")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {draft.lines.map((line, i) => (
                  <LineRow
                    key={line.key}
                    line={line}
                    rate={ev.lineRates[i]}
                    customerType={draft.customer.type}
                    onChange={(next) => setLines((lines) => lines.map((l) => (l.key === line.key ? next : l)))}
                    onRemove={() => setLines((lines) => lines.filter((l) => l.key !== line.key))}
                  />
                ))}
              </ul>
            )}
            {delivery && settings.deliveryPresets.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3.5 sm:px-6">
                <Truck className="size-5 text-slate-500" />
                <span className="mr-1 text-[15px] font-medium text-slate-700">{t("newBill.delivery")}</span>
                {settings.deliveryPresets.map((amount) => {
                  const active = deliveryLine && ev.lineRates[draft.lines.indexOf(deliveryLine)] === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setDelivery(amount)}
                      className={
                        active
                          ? "rounded-full border border-brand-700 bg-brand-50 px-3.5 py-1.5 text-sm font-semibold text-brand-900"
                          : "rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:border-brand-300"
                      }
                    >
                      {formatRupees(amount)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </Card>

          <ScrapSection
            scrap={draft.scrap}
            values={ev.scrapValues}
            scrapRatePerKg={settings.scrapRatePerKg}
            onChange={(scrap) => setDraft((d) => ({ ...d, scrap }))}
          />
        </div>

        <div className="lg:sticky lg:top-20">
          <PaymentSection
            draft={draft}
            ev={ev}
            saving={saving}
            canWhatsApp={isValidMobile(draft.customer.phone)}
            onPaymentsChange={(payments) => setDraft((d) => ({ ...d, payments }))}
            onFinanceChange={(finance) => setDraft((d) => ({ ...d, finance }))}
            onSave={(then) => void save(then)}
            onStartAgain={() => void startAgain()}
          />
        </div>
      </div>
    </div>
  );
}
