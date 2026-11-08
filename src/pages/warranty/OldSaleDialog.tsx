import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { listCatalog, searchCatalog } from "@/data/catalog";
import { asBillError } from "@/data/errors";
import { productLabel, type CatalogProduct } from "@/data/types";
import { addOldSale } from "@/data/warranty";
import { formatDate, todayISO } from "@/lib/dates";
import { useAsync } from "@/lib/useAsync";

/** A battery sold before the app, typed in from the paper register. */
export function OldSaleDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (serial: string) => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const catalog = useAsync(listCatalog);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [serial, setSerial] = useState("");
  const [soldOn, setSoldOn] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery("");
      setProduct(null);
      setSerial("");
      setSoldOn("");
      setPhone("");
      setName("");
    }
  }, [open]);

  const choices = useMemo(
    () => searchCatalog((catalog.data ?? []).filter((p) => p.hasSerial && !p.isService), query, 6),
    [catalog.data, query],
  );
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(soldOn) && soldOn <= todayISO();
  const phoneDigits = phone.replace(/\D/g, "");
  const valid = product !== null && serial.trim() !== "" && dateOk && phoneDigits.length >= 10;

  const save = async () => {
    if (!product || !valid) return;
    setSaving(true);
    try {
      await addOldSale({ productId: product.id, serial: serial.trim(), soldOn, phone, name });
      toast(t("warranty.saved", { serial: serial.trim() }));
      onSaved(serial.trim());
      onClose();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("warranty.oldTitle")}
      description={t("warranty.oldText")}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" disabled={!valid} loading={saving} onClick={() => void save()}>
            {t("warranty.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="old-product" className="text-sm font-semibold text-slate-700">
            {t("warranty.product")}
          </label>
          {product ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
              <span className="flex-1 text-[15px] font-semibold text-brand-900">{productLabel(product)}</span>
              <Button size="sm" variant="ghost" onClick={() => setProduct(null)}>
                {t("warranty.change")}
              </Button>
            </div>
          ) : (
            <>
              <Input id="old-product" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("warranty.productPlaceholder")} data-autofocus />
              {choices.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {choices.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setProduct(p)} className="flex min-h-11 w-full items-center px-4 text-left text-[15px] hover:bg-brand-50">
                        {productLabel(p)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <Field label={t("warranty.serial")} htmlFor="old-serial">
          <Input id="old-serial" value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" autoComplete="off" />
        </Field>
        <Field label={t("warranty.oldSoldOn")} htmlFor="old-date" hint={dateOk ? formatDate(soldOn, i18n.language) : undefined}>
          <Input id="old-date" type="date" max={todayISO()} value={soldOn} onChange={(e) => setSoldOn(e.target.value)} className="w-52" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("warranty.phone")} htmlFor="old-phone">
            <Input id="old-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={16} />
          </Field>
          <Field label={t("warranty.name")} htmlFor="old-name" hint={t("warranty.nameHint")}>
            <Input id="old-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
