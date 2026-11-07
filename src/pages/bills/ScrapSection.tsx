import { Plus, Recycle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { formatRupees, paiseToInput, type Paise } from "@/lib/money";
import { newKey, type DraftScrap } from "./billDraft";

interface Props {
  scrap: DraftScrap[];
  values: (Paise | null)[];
  scrapRatePerKg: Paise;
  onChange: (scrap: DraftScrap[]) => void;
}

/** Old batteries taken from the customer: by weight (₹105/kg by default) or a fixed amount. */
export function ScrapSection({ scrap, values, scrapRatePerKg, onChange }: Props) {
  const { t } = useTranslation();
  const types = t("newBill.scrapTypes", { returnObjects: true }) as string[];

  const update = (i: number, patch: Partial<DraftScrap>) =>
    onChange(scrap.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const add = () =>
    onChange([
      ...scrap,
      {
        key: newKey(),
        batteryType: types[0] ?? "",
        mode: "weight",
        weightText: "",
        rateText: paiseToInput(scrapRatePerKg),
        fixedText: "",
      },
    ]);

  return (
    <Card>
      <CardHeader
        icon={Recycle}
        title={t("newBill.oldBattery")}
        actions={
          <Button variant="secondary" size="sm" icon={Plus} onClick={add}>
            {t("newBill.addOldBattery")}
          </Button>
        }
        className={scrap.length === 0 ? "border-b-0" : undefined}
      />
      {scrap.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {scrap.map((s, i) => (
            <li key={s.key} className="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6">
              <div className="min-w-44 flex-1">
                <label className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`scrap-type-${s.key}`}>
                  {t("newBill.batteryType")}
                </label>
                <Input
                  id={`scrap-type-${s.key}`}
                  list="scrap-types"
                  value={s.batteryType}
                  onChange={(e) => update(i, { batteryType: e.target.value })}
                />
              </div>
              <Segmented<DraftScrap["mode"]>
                label={t("newBill.oldBattery")}
                value={s.mode}
                onChange={(mode) => update(i, { mode })}
                options={[
                  { value: "weight", label: t("newBill.byWeight") },
                  { value: "fixed", label: t("newBill.fixedAmount") },
                ]}
                className="mb-0.5"
              />
              {s.mode === "weight" ? (
                <>
                  <div className="w-28">
                    <label className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`scrap-kg-${s.key}`}>
                      {t("newBill.weight")}
                    </label>
                    <Input
                      id={`scrap-kg-${s.key}`}
                      inputMode="decimal"
                      suffix={t("newBill.kg")}
                      value={s.weightText}
                      onChange={(e) => update(i, { weightText: e.target.value })}
                      invalid={values[i] === null && s.weightText !== ""}
                      className="pr-12"
                    />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`scrap-rate-${s.key}`}>
                      {t("newBill.ratePerKg")}
                    </label>
                    <Input
                      id={`scrap-rate-${s.key}`}
                      inputMode="decimal"
                      prefix="₹"
                      value={s.rateText}
                      onChange={(e) => update(i, { rateText: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <div className="w-36">
                  <label className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase" htmlFor={`scrap-fixed-${s.key}`}>
                    {t("newBill.amount")}
                  </label>
                  <Input
                    id={`scrap-fixed-${s.key}`}
                    inputMode="decimal"
                    prefix="₹"
                    value={s.fixedText}
                    onChange={(e) => update(i, { fixedText: e.target.value })}
                  />
                </div>
              )}
              <p className="ml-auto pb-2 text-lg font-bold text-emerald-700 tabular-nums">
                {values[i] ? `− ${formatRupees(values[i]!)}` : "—"}
              </p>
              <button
                type="button"
                onClick={() => onChange(scrap.filter((_, j) => j !== i))}
                aria-label={t("common.remove")}
                className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <X className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <datalist id="scrap-types">
        {types.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
    </Card>
  );
}
