import { Minus, Plus, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { productLabel, type CustomerType } from "@/data/types";
import { warrantyText } from "@/lib/billMath";
import { formatDate } from "@/lib/dates";
import { formatRupees, type Paise } from "@/lib/money";
import { lineWarranty, type DraftLine } from "./billDraft";

const TYPED = "__typed";

interface Props {
  line: DraftLine;
  rate: Paise | null;
  customerType: CustomerType;
  onChange: (line: DraftLine) => void;
  onRemove: () => void;
}

/** One item on the bill: serial number (for batteries), quantity (for other items) and price. */
export function LineRow({ line, rate, customerType, onChange, onRemove }: Props) {
  const { t, i18n } = useTranslation();
  const p = line.product;
  const w = lineWarranty(line);
  const warranty = w ? warrantyText(w.free, w.prorata) : "";
  const editingWarranty = line.warrantyFree !== undefined || line.warrantyProrata !== undefined;
  const aboveMrp = rate !== null && p.mrp !== null && rate > p.mrp;
  const usingDealerPrice = customerType === "dealer" && p.dealerPrice !== null && !line.priceEdited;

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-slate-900">{productLabel(p)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            <span>{p.category}</span>
            {!p.isService ? (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className={warranty ? "size-3.5 text-emerald-600" : "size-3.5 text-slate-400"} />
                {warranty || t("newBill.noWarranty")}
                {!editingWarranty ? (
                  <button
                    type="button"
                    onClick={() => onChange({ ...line, warrantyFree: String(w?.free ?? 0), warrantyProrata: String(w?.prorata ?? 0) })}
                    className="ml-1 rounded-lg px-2 py-1.5 font-semibold text-brand-800 hover:bg-brand-50"
                  >
                    {warranty ? t("newBill.changeWarranty") : t("newBill.addWarranty")}
                  </button>
                ) : null}
              </span>
            ) : null}
          </p>
          {editingWarranty ? (
            <div className="mt-2 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
              <div className="w-28">
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor={`wfree-${line.key}`}>
                  {t("newBill.warrantyFree")}
                </label>
                <Input
                  id={`wfree-${line.key}`}
                  inputMode="numeric"
                  value={line.warrantyFree ?? ""}
                  onChange={(e) => onChange({ ...line, warrantyFree: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  invalid={w === null}
                />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor={`wpro-${line.key}`}>
                  {t("newBill.warrantyProrata")}
                </label>
                <Input
                  id={`wpro-${line.key}`}
                  inputMode="numeric"
                  value={line.warrantyProrata ?? ""}
                  onChange={(e) => onChange({ ...line, warrantyProrata: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  invalid={w === null}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...line, warrantyFree: undefined, warrantyProrata: undefined })}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t("newBill.productWarranty", { warranty: warrantyText(p.warrantyFreeMonths, p.warrantyProrataMonths) || t("newBill.noWarranty") })}
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("newBill.remove")}
          className="-mt-1 -mr-2 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        {p.hasSerial ? (
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`serial-${line.key}`}>
              {t("newBill.serial")}
            </label>
            {line.units.length > 0 ? (
              <Select
                id={`serial-${line.key}`}
                value={line.unitId ?? TYPED}
                onChange={(e) =>
                  onChange(
                    e.target.value === TYPED
                      ? { ...line, unitId: null }
                      : { ...line, unitId: e.target.value, serial: "" },
                  )
                }
                className="font-mono"
              >
                {line.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.serial}
                    {u.arrivedOn ? ` · ${t("newBill.arrived", { date: formatDate(u.arrivedOn, i18n.language) })}` : ""}
                  </option>
                ))}
                <option value={TYPED}>{t("newBill.otherSerial")}</option>
              </Select>
            ) : null}
            {line.unitId === null ? (
              <Input
                id={line.units.length > 0 ? undefined : `serial-${line.key}`}
                value={line.serial}
                onChange={(e) => onChange({ ...line, serial: e.target.value.toUpperCase() })}
                placeholder={line.units.length > 0 ? t("newBill.serialPlaceholder") : t("newBill.noStockSerial")}
                className={line.units.length > 0 ? "mt-2 font-mono uppercase" : "font-mono uppercase"}
                spellCheck={false}
                autoComplete="off"
                invalid={!line.serial.trim()}
              />
            ) : null}
          </div>
        ) : !p.isService ? (
          <div>
            <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">{t("newBill.qty")}</span>
            <div className="flex items-center rounded-xl border border-slate-300 bg-white shadow-sm">
              <button
                type="button"
                aria-label={t("newBill.less")}
                disabled={line.qty <= 1}
                onClick={() => onChange({ ...line, qty: line.qty - 1 })}
                className="flex size-11 items-center justify-center rounded-l-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-10 text-center text-[17px] font-semibold tabular-nums">{line.qty}</span>
              <button
                type="button"
                aria-label={t("newBill.more")}
                disabled={line.qty >= p.inStock}
                title={line.qty >= p.inStock ? t("newBill.onlyInStock", { product: productLabel(p), count: Math.max(p.inStock, 0) }) : undefined}
                onClick={() => onChange({ ...line, qty: line.qty + 1 })}
                className="flex size-11 items-center justify-center rounded-r-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <span className={line.qty > p.inStock ? "mt-1 block text-xs font-semibold text-red-600" : "mt-1 block text-xs text-slate-500"}>
              {t("newBill.inStock", { count: Math.max(p.inStock, 0) })}
            </span>
          </div>
        ) : null}

        <div className="w-36">
          <label className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`price-${line.key}`}>
            {t("newBill.price")}
          </label>
          <Input
            id={`price-${line.key}`}
            inputMode="decimal"
            prefix="₹"
            value={line.rateText}
            onChange={(e) => onChange({ ...line, rateText: e.target.value, priceEdited: true })}
            invalid={rate === null || rate <= 0 || aboveMrp}
            className="text-[16px] font-semibold"
          />
        </div>
        <div className="min-w-0 flex-1 pb-1 text-sm">
          {p.mrp !== null ? (
            <p className={aboveMrp ? "font-semibold text-red-600" : "text-slate-500"}>
              {t("newBill.mrp", { amount: formatRupees(p.mrp) })}
            </p>
          ) : null}
          {usingDealerPrice ? <Badge tone="brand">{t("newBill.dealerPrice")}</Badge> : null}
        </div>
        <p className="pb-2 text-right text-lg font-bold text-slate-900 tabular-nums">
          {rate !== null ? formatRupees(rate * line.qty) : "—"}
        </p>
      </div>
    </li>
  );
}
