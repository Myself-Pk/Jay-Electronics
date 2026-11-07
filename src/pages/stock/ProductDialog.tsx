import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { listInStockUnits } from "@/data/catalog";
import { asBillError } from "@/data/errors";
import { getPurchasePrice, saveProduct } from "@/data/products";
import { productLabel, type CatalogProduct, type Category, type Role, type StockUnit } from "@/data/types";
import { warrantyText } from "@/lib/billMath";
import { formatDate } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { draftToProductInput, emptyProductDraft, productToDraft, type ProductDraft, type ProductErrors } from "./productForm";

interface Props {
  open: boolean;
  /** null = add a new product */
  product: CatalogProduct | null;
  categories: Category[];
  brands: string[];
  role: Role;
  onClose: () => void;
  onSaved: () => void;
}

/** Owner: add or edit a product. Staff: see the product's details and serials in stock. */
export function ProductDialog({ open, product, categories, brands, role, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const isOwner = role === "owner" || role === "admin";
  const [draft, setDraft] = useState<ProductDraft>(() => emptyProductDraft(categories[0]));
  const [errors, setErrors] = useState<ProductErrors>({});
  const [units, setUnits] = useState<StockUnit[] | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setShowMore(false);
    setUnits(null);
    if (!product) {
      setDraft(emptyProductDraft(categories[0]));
      return;
    }
    setDraft(productToDraft(product, null));
    if (isOwner) {
      getPurchasePrice(product.id).then(
        (price) => setDraft((d) => ({ ...productToDraft(product, price), ...pickTyped(d, product) })),
        () => undefined,
      );
    }
    if (product.hasSerial) listInStockUnits(product.id).then(setUnits, () => setUnits([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _gone, ...rest }) => rest);
  };
  const err = (key: keyof ProductDraft) => (errors[key] ? t(errors[key]!) : undefined);
  const category = categories.find((c) => c.id === draft.categoryId);

  const save = async () => {
    const result = draftToProductInput(draft, categories, isOwner);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await saveProduct(result.input, role);
      toast(t("stock.form.saved", { product: productLabel({ ...result.input, brand: result.input.brand || null }) }));
      onSaved();
      onClose();
    } catch (e) {
      const be = asBillError(e);
      toast(be ? t(`billErrors.${be.code}`, be.details as Record<string, string>) : t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  const serialList =
    product?.hasSerial ? (
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-700">{t("stock.serialsInStock", { count: units?.length ?? product.inStock })}</p>
        {units === null ? (
          <div className="mt-2 h-8 animate-pulse rounded-lg bg-slate-100" />
        ) : units.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t("stock.noSerials")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {units.map((u) => (
              <li key={u.id} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm">
                <span className="font-mono font-semibold text-slate-800">{u.serial}</span>
                {u.arrivedOn ? (
                  <span className="text-slate-500"> · {t("stock.arrived", { date: formatDate(u.arrivedOn, i18n.language) })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    ) : null;

  // ----- Staff: read-only details -----
  if (!isOwner) {
    return (
      <Dialog open={open} onClose={onClose} title={product ? productLabel(product) : ""} description={product?.category}>
        {product ? (
          <div className="pb-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px]">
              <div>
                <dt className="text-sm text-slate-500">{t("stock.price")}</dt>
                <dd className="font-semibold">{formatRupees(product.retailPrice)}</dd>
              </div>
              {product.dealerPrice !== null ? (
                <div>
                  <dt className="text-sm text-slate-500">{t("stock.dealerPrice")}</dt>
                  <dd className="font-semibold">{formatRupees(product.dealerPrice)}</dd>
                </div>
              ) : null}
              {product.mrp !== null ? (
                <div>
                  <dt className="text-sm text-slate-500">{t("stock.mrp")}</dt>
                  <dd className="font-semibold">{formatRupees(product.mrp)}</dd>
                </div>
              ) : null}
              {product.hasSerial ? (
                <div>
                  <dt className="text-sm text-slate-500">{t("stock.warranty")}</dt>
                  <dd className="font-semibold">{warrantyText(product.warrantyFreeMonths, product.warrantyProrataMonths) || "—"}</dd>
                </div>
              ) : null}
            </dl>
            {serialList}
          </div>
        ) : null}
      </Dialog>
    );
  }

  // ----- Owner: add / edit form -----
  const labelCls = "text-xs font-semibold tracking-wide text-slate-500 uppercase";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? t("stock.form.editTitle") : t("stock.form.addTitle")}
      description={product ? productLabel(product) : undefined}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" loading={saving} onClick={() => void save()}>
            {t("stock.form.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("stock.form.category")} htmlFor="pf-category" error={err("categoryId")}>
            <Select
              id="pf-category"
              value={draft.categoryId}
              onChange={(e) => {
                const c = categories.find((x) => x.id === e.target.value);
                setDraft((d) => ({ ...d, categoryId: e.target.value, hasSerial: product ? d.hasSerial : (c?.hasSerialByDefault ?? d.hasSerial) }));
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("stock.form.brand")} htmlFor="pf-brand" hint={t("stock.form.brandHint")}>
            <Input id="pf-brand" list="pf-brands" value={draft.brand} onChange={(e) => set("brand", e.target.value)} data-autofocus />
            <datalist id="pf-brands">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label={t("stock.form.model")} htmlFor="pf-model" hint={t("stock.form.modelHint")} error={err("model")}>
            <Input id="pf-model" value={draft.model} onChange={(e) => set("model", e.target.value)} invalid={!!errors.model} />
          </Field>
          <Field label={t("stock.form.capacity")} htmlFor="pf-capacity" hint={t("stock.form.capacityHint")}>
            <Input id="pf-capacity" value={draft.capacity} onChange={(e) => set("capacity", e.target.value)} />
          </Field>
        </div>

        <div>
          <p className={labelCls}>{t("stock.form.prices")}</p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label={t("stock.form.retail")} htmlFor="pf-retail" error={err("retail")}>
              <Input id="pf-retail" inputMode="decimal" prefix="₹" value={draft.retail} onChange={(e) => set("retail", e.target.value)} invalid={!!errors.retail} className="font-semibold" />
            </Field>
            <Field label={t("stock.form.mrp")} htmlFor="pf-mrp" optional={t("common.optional")} error={err("mrp")}>
              <Input id="pf-mrp" inputMode="decimal" prefix="₹" value={draft.mrp} onChange={(e) => set("mrp", e.target.value)} invalid={!!errors.mrp} />
            </Field>
            <Field label={t("stock.form.dealer")} htmlFor="pf-dealer" optional={t("common.optional")} error={err("dealer")}>
              <Input id="pf-dealer" inputMode="decimal" prefix="₹" value={draft.dealer} onChange={(e) => set("dealer", e.target.value)} invalid={!!errors.dealer} />
            </Field>
            <Field label={t("stock.form.minPrice")} htmlFor="pf-min" optional={t("common.optional")} error={err("minPrice")}>
              <Input id="pf-min" inputMode="decimal" prefix="₹" value={draft.minPrice} onChange={(e) => set("minPrice", e.target.value)} invalid={!!errors.minPrice} />
            </Field>
            <Field label={t("stock.form.purchase")} htmlFor="pf-purchase" hint={t("stock.form.purchaseHint")} error={err("purchase")} className="sm:col-span-2">
              <Input id="pf-purchase" inputMode="decimal" prefix="₹" value={draft.purchase} onChange={(e) => set("purchase", e.target.value)} invalid={!!errors.purchase} className="sm:w-56" />
            </Field>
          </div>
        </div>

        {category?.isService ? null : (
          <Switch checked={draft.hasSerial} onChange={(v) => set("hasSerial", v)} label={t("stock.form.hasSerial")} description={t("stock.form.hasSerialHint")} />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {draft.hasSerial && !category?.isService ? (
            <>
              <Field label={t("stock.form.warrantyFree")} htmlFor="pf-free" error={err("warrantyFree")}>
                <Input id="pf-free" inputMode="numeric" value={draft.warrantyFree} onChange={(e) => set("warrantyFree", e.target.value)} invalid={!!errors.warrantyFree} />
              </Field>
              <Field label={t("stock.form.warrantyProrata")} htmlFor="pf-prorata" error={err("warrantyProrata")}>
                <Input id="pf-prorata" inputMode="numeric" value={draft.warrantyProrata} onChange={(e) => set("warrantyProrata", e.target.value)} invalid={!!errors.warrantyProrata} />
              </Field>
            </>
          ) : null}
          {category?.isService ? null : (
            <Field label={t("stock.form.lowStock")} htmlFor="pf-low" error={err("lowStock")}>
              <Input id="pf-low" inputMode="numeric" value={draft.lowStock} onChange={(e) => set("lowStock", e.target.value)} invalid={!!errors.lowStock} />
            </Field>
          )}
          {!product && !draft.hasSerial && !category?.isService ? (
            <Field label={t("stock.form.openingStock")} htmlFor="pf-opening" error={err("openingStock")}>
              <Input id="pf-opening" inputMode="numeric" value={draft.openingStock} onChange={(e) => set("openingStock", e.target.value)} invalid={!!errors.openingStock} />
            </Field>
          ) : null}
        </div>
        {!product && draft.hasSerial && !category?.isService ? (
          <p className="-mt-2 flex items-start gap-2 text-sm text-slate-500">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            {t("stock.form.openingStockHint")}
          </p>
        ) : null}

        <div>
          <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-brand-800">
            <ChevronDown className={showMore ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
            {t("stock.form.more")}
          </button>
          {showMore ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label={t("stock.form.type")} htmlFor="pf-type" hint={t("stock.form.typeHint")}>
                <Input id="pf-type" value={draft.type} onChange={(e) => set("type", e.target.value)} />
              </Field>
              <Field label={t("stock.form.hsn")} htmlFor="pf-hsn">
                <Input id="pf-hsn" value={draft.hsn} onChange={(e) => set("hsn", e.target.value)} placeholder={category?.defaultHsn} />
              </Field>
              <Field label={t("stock.form.gstRate")} htmlFor="pf-gst" error={err("gstRate")}>
                <Input id="pf-gst" inputMode="decimal" suffix="%" value={draft.gstRate} onChange={(e) => set("gstRate", e.target.value)} invalid={!!errors.gstRate} />
              </Field>
            </div>
          ) : null}
        </div>

        {product ? (
          <Switch checked={draft.active} onChange={(v) => set("active", v)} label={t("stock.form.active")} description={t("stock.form.activeHint")} />
        ) : null}
        {product && !product.isService ? (
          <Badge tone={product.inStock > 0 ? "green" : "amber"} className="self-start">
            {product.inStock > 0 ? t("stock.inStock", { count: product.inStock }) : t("stock.outOfStock")}
          </Badge>
        ) : null}
        {serialList}
      </div>
    </Dialog>
  );
}

/** Keep anything typed while the purchase price was loading. */
function pickTyped(current: ProductDraft, product: CatalogProduct): Partial<ProductDraft> {
  const original = productToDraft(product, null);
  const changed: Partial<ProductDraft> = {};
  for (const key of Object.keys(current) as (keyof ProductDraft)[]) {
    if (key !== "purchase" && current[key] !== original[key]) (changed as Record<string, unknown>)[key] = current[key];
  }
  return changed;
}
