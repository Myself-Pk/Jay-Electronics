import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ui/Confirm";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { listCatalog, searchCatalog } from "@/data/catalog";
import { asBillError } from "@/data/errors";
import { moveUnit } from "@/data/stock";
import { productLabel, type CatalogProduct } from "@/data/types";
import type { WarrantyUnit } from "@/data/warranty";
import { useAsync } from "@/lib/useAsync";

/**
 * A battery / inverter in the shop was saved under the wrong product: pick the right one.
 * The piece keeps its serial number; one piece of stock moves from the old product to the new one.
 */
export function MoveUnitDialog({ unit, onClose, onMoved }: { unit: WarrantyUnit | null; onClose: () => void; onMoved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const catalog = useAsync(listCatalog, [unit?.unitId]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  // Only serial-numbered products can hold a serial; the one it's in now is left out.
  const choices = useMemo(
    () => (catalog.data ?? []).filter((p) => p.hasSerial && !p.isService && productLabel(p) !== unit?.product),
    [catalog.data, unit?.product],
  );
  const matches = useMemo(() => (q.trim() ? searchCatalog(choices, q, 8) : []), [choices, q]);

  const close = () => {
    setQ("");
    onClose();
  };

  const choose = async (product: CatalogProduct) => {
    if (!unit || saving) return;
    const ok = await confirm({
      title: t("warranty.moveConfirm", { serial: unit.serial }),
      lines: [
        { label: t("warranty.moveFrom"), value: unit.product },
        { label: t("warranty.moveTo"), value: productLabel(product) },
      ],
      confirmLabel: t("warranty.moveYes"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await moveUnit(unit.unitId, product.id);
      toast(t("warranty.moved", { serial: unit.serial, product: productLabel(product) }));
      close();
      onMoved();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={unit !== null}
      onClose={close}
      title={unit ? t("warranty.moveTitle", { serial: unit.serial }) : ""}
      description={unit ? t("warranty.moveText", { product: unit.product }) : undefined}
    >
      <div className="flex flex-col gap-3 pb-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("scan.linkSearch")} data-autofocus autoComplete="off" />
        {matches.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void choose(p)}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-50 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">{productLabel(p)}</span>
                    <span className="block text-sm text-slate-500">{p.category}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : q.trim() ? (
          <p className="text-[15px] text-slate-500">{t("warranty.moveNone", { q: q.trim() })}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
