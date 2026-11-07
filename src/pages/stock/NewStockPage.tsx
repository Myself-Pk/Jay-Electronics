import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { CircleAlert, PackagePlus, RotateCcw, ScanBarcode, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { listCatalog, lookupSerial } from "@/data/catalog";
import { asBillError } from "@/data/errors";
import { listSuppliers, receiveStock } from "@/data/stock";
import { productLabel, type CatalogProduct } from "@/data/types";
import { formatDate, todayISO } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { newKey } from "../bills/billDraft";
import { ItemSearch } from "../bills/ItemSearch";
import { emptyStockDraft, evaluateStock, splitSerials, toStockInput, type StockDraft, type StockLine } from "./stockDraft";

const DRAFT_KEY = "je-stock-draft";
const loadDraft = (): StockDraft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as StockDraft) : null;
  } catch {
    return null;
  }
};

/** One product on the stock entry: a scan box for batteries, a quantity for everything else. */
function StockLineRow({
  line,
  index,
  lineTotal,
  qty,
  kind,
  onChange,
  onRemove,
  onScan,
}: {
  line: StockLine;
  index: number;
  lineTotal: number | null;
  qty: number;
  kind: StockDraft["kind"];
  onChange: (line: StockLine) => void;
  onRemove: () => void;
  onScan: (text: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const label = "mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase";

  const onKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !scan.trim() || busy) return;
    e.preventDefault();
    setBusy(true);
    await onScan(scan);
    setScan("");
    setBusy(false);
  };

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-slate-900">{productLabel(line.product)}</p>
          <p className="text-sm text-slate-500">{line.product.category}</p>
        </div>
        <button type="button" onClick={onRemove} aria-label={t("common.remove")} className="-mt-1 -mr-2 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
          <X className="size-5" />
        </button>
      </div>

      {line.product.hasSerial ? (
        <div className="mt-3">
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
            <input
              id={`scan-${index}`}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => void onKey(e)}
              placeholder={t("newStock.scanPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-11 font-mono text-[15px] uppercase shadow-sm placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
            />
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-700">{t("newStock.scanned", { count: line.serials.length })}</p>
          {line.serials.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {line.serials.map((s) => (
                <li key={s} className="flex items-center gap-1 rounded-lg bg-emerald-50 py-1 pr-1 pl-2.5 font-mono text-sm font-semibold text-emerald-900">
                  {s}
                  <button
                    type="button"
                    onClick={() => onChange({ ...line, serials: line.serials.filter((x) => x !== s) })}
                    aria-label={t("common.remove")}
                    className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {!line.product.hasSerial ? (
          <div className="w-28">
            <label className={label} htmlFor={`qty-${index}`}>{t("newStock.qty")}</label>
            <Input id={`qty-${index}`} inputMode="numeric" value={line.qtyText} onChange={(e) => onChange({ ...line, qtyText: e.target.value.replace(/\D/g, "") })} invalid={qty <= 0} />
          </div>
        ) : null}
        <div className="w-36">
          <label className={label} htmlFor={`rate-${index}`}>{t("newStock.rate")}</label>
          <Input id={`rate-${index}`} inputMode="decimal" prefix="₹" value={line.rateText} onChange={(e) => onChange({ ...line, rateText: e.target.value })} invalid={kind === "purchase" && lineTotal === null} />
        </div>
        <div className="w-32">
          <label className={label} htmlFor={`gst-${index}`}>{t("newStock.gst")}</label>
          <Input id={`gst-${index}`} inputMode="decimal" prefix="₹" value={line.gstText} onChange={(e) => onChange({ ...line, gstText: e.target.value })} />
        </div>
        <p className="ml-auto pb-2 text-right">
          <span className="block text-xs text-slate-500">{t("newStock.lineTotal")}</span>
          <span className="text-lg font-bold text-slate-900 tabular-nums">{lineTotal !== null ? formatRupees(lineTotal) : "—"}</span>
        </p>
      </div>
      {kind === "purchase" ? <p className="mt-1 text-xs text-slate-500">{t("newStock.rateHint")}</p> : null}
    </li>
  );
}

export function NewStockPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const today = todayISO();
  const catalog = useAsync(listCatalog);
  const suppliers = useAsync(listSuppliers);
  const [draft, setDraft] = useState<StockDraft>(() => loadDraft() ?? emptyStockDraft(today));
  const [saving, setSaving] = useState(false);
  const focusNext = useRef<number | null>(null);

  useEffect(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)), [draft]);
  useEffect(() => {
    if (focusNext.current !== null) {
      document.getElementById(`scan-${focusNext.current}`)?.focus() ?? document.getElementById(`qty-${focusNext.current}`)?.focus();
      focusNext.current = null;
    }
  });

  const ev = evaluateStock(draft, today);
  const stockable = (catalog.data ?? []).filter((p) => !p.isService);

  const addProduct = (product: CatalogProduct) => {
    const existing = draft.lines.findIndex((l) => l.product.id === product.id);
    if (existing >= 0) {
      focusNext.current = existing;
      setDraft({ ...draft });
      return;
    }
    focusNext.current = draft.lines.length;
    setDraft({
      ...draft,
      lines: [...draft.lines, { key: newKey(), product, serials: [], qtyText: product.hasSerial ? "" : "1", rateText: "", gstText: "" }],
    });
  };

  const updateLine = (index: number, line: StockLine) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, i) => (i === index ? line : l)) }));

  /** Add scanned serials to a line, refusing ones already on this entry or already in the system. */
  const scanInto = async (index: number, text: string) => {
    const onThisEntry = new Set(draft.lines.flatMap((l) => l.serials));
    const added: string[] = [];
    for (const serial of splitSerials(text)) {
      if (onThisEntry.has(serial) || added.includes(serial)) {
        toast(t("newStock.serialTwice", { serial }), "error");
        continue;
      }
      const known = await lookupSerial(serial).catch(() => null);
      if (known) {
        toast(t("newStock.serialKnown", { serial, status: t(`newStock.status.${known.status}`) }), "error");
        continue;
      }
      added.push(serial);
    }
    if (added.length > 0) {
      setDraft((d) => ({ ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, serials: [...l.serials, ...added] } : l)) }));
    }
  };

  const startAgain = async () => {
    if (!(await confirm({ title: t("newStock.startAgainConfirm"), confirmLabel: t("newBill.yesClear"), tone: "danger" }))) return;
    setDraft(emptyStockDraft(today));
  };

  const save = async () => {
    if (ev.problems.length > 0) return;
    const ok = await confirm({
      title: t("newStock.confirmTitle", { count: ev.pieces }),
      lines: [
        ...(draft.kind === "purchase"
          ? [{ label: t("newStock.supplier"), value: `${draft.supplierName.trim()}${draft.billNo.trim() ? ` · ${draft.billNo.trim()}` : ""}` }]
          : [{ label: t("newStock.opening"), value: formatDate(draft.billDate, i18n.language) }]),
        ...draft.lines.map((l, i) => ({ label: productLabel(l.product), value: `+${ev.qty[i]}` })),
        ...(ev.total > 0 ? [{ label: t("newStock.billTotal"), value: formatRupees(ev.total) }] : []),
      ],
      confirmLabel: t("newStock.confirmYes"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await receiveStock(toStockInput(draft, ev));
      sessionStorage.removeItem(DRAFT_KEY);
      toast(t("newStock.saved", { count: ev.pieces }));
      navigate("/stock");
    } catch (e) {
      const be = asBillError(e);
      toast(be ? t(`billErrors.${be.code}`, be.details as Record<string, string>) : t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
        <PackagePlus className="size-7 text-brand-800" />
        {t("newStock.title")}
      </h1>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <Segmented<StockDraft["kind"]>
                label={t("newStock.title")}
                value={draft.kind}
                onChange={(kind) => setDraft({ ...draft, kind })}
                options={[
                  { value: "purchase", label: t("newStock.fromDistributor") },
                  { value: "opening_stock", label: t("newStock.opening") },
                ]}
                className="self-start"
              />
              {draft.kind === "opening_stock" ? (
                <p className="text-sm text-slate-600">{t("newStock.openingHint")}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t("newStock.supplier")} htmlFor="ns-supplier" hint={t("newStock.supplierHint")} className="sm:col-span-3">
                    <Input id="ns-supplier" list="ns-suppliers" value={draft.supplierName} onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })} />
                    <datalist id="ns-suppliers">
                      {(suppliers.data ?? []).map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label={t("newStock.billNo")} htmlFor="ns-billno" optional={t("common.optional")}>
                    <Input id="ns-billno" value={draft.billNo} onChange={(e) => setDraft({ ...draft, billNo: e.target.value })} />
                  </Field>
                  <Field label={t("newStock.billDate")} htmlFor="ns-date" hint={/^\d{4}-\d{2}-\d{2}$/.test(draft.billDate) ? formatDate(draft.billDate, i18n.language) : undefined}>
                    <Input id="ns-date" type="date" max={today} value={draft.billDate} onChange={(e) => setDraft({ ...draft, billDate: e.target.value })} />
                  </Field>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={PackagePlus} title={t("newStock.items")} />
            <div className="p-4 sm:px-6">
              <ItemSearch
                catalog={stockable}
                onPick={addProduct}
                onEnterText={async () => false}
                placeholder={t("newStock.searchPlaceholder")}
              />
            </div>
            {draft.lines.length === 0 ? (
              <p className="border-t border-slate-100 px-6 py-8 text-center text-[15px] text-slate-500">{t("newStock.noItems")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {draft.lines.map((line, i) => (
                  <StockLineRow
                    key={line.key}
                    line={line}
                    index={i}
                    qty={ev.qty[i]}
                    lineTotal={ev.lineTotals[i]}
                    kind={draft.kind}
                    onChange={(next) => updateLine(i, next)}
                    onRemove={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
                    onScan={(text) => scanInto(i, text)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-slate-600">{t("newStock.pieces", { count: ev.pieces })}</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
              <span className="text-base font-bold text-slate-900">{t("newStock.billTotal")}</span>
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{formatRupees(ev.total)}</span>
            </div>
          </Card>
          {ev.problems.length > 0 && draft.lines.length > 0 ? (
            <ul className="flex flex-col gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
              {ev.problems.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm font-medium text-red-700">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  {t(`newStock.problems.${p.key}`, p.params)}
                </li>
              ))}
            </ul>
          ) : null}
          <Button size="xl" icon={PackagePlus} disabled={ev.problems.length > 0} loading={saving} onClick={() => void save()}>
            {t("newStock.save")}
          </Button>
          {draft.lines.length > 0 || draft.supplierName ? (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => void startAgain()} className="self-center">
              {t("newStock.startAgain")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
