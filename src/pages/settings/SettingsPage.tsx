import { useEffect, useState } from "react";
import { CalendarClock, DatabaseBackup, FileText, Landmark, Percent, Plus, Store, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { RadioCard } from "@/components/ui/RadioCard";
import { useToast } from "@/components/ui/Toast";
import { getSettings, saveSettings } from "@/data/settings";
import { formatBillNumber, isValidBillPrefix } from "@/lib/billNumber";
import { formatDate, todayISO } from "@/lib/dates";
import { formatPercent, parsePercent } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { BACKUP_READY_BY } from "../comingSoon";
import { PeopleSection } from "./PeopleSection";
import { fromDraft, toDraft, type DraftErrors, type SettingsDraft } from "./settingsDraft";

const fieldId = (key: string) => `s-${key.replace(".", "-")}`;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const loaded = useAsync(getSettings);
  const [saved, setSaved] = useState<SettingsDraft | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loaded.data) return;
    const d = toDraft(loaded.data);
    setSaved(d);
    setDraft(d);
  }, [loaded.data]);

  if (loaded.error) {
    return (
      <Card className="p-6 text-center text-red-700">
        <p>{t("common.somethingWrong")}</p>
        <Button variant="secondary" className="mt-4" onClick={loaded.reload}>
          {t("common.retry")}
        </Button>
      </Card>
    );
  }
  if (!draft || !saved) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
        <div className="h-48 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft({ ...draft, [key]: value });
    if (errors[key]) {
      const { [key]: _removed, ...rest } = errors;
      setErrors(rest);
    }
  };
  const errorText = (key: string) => (errors[key] ? t(errors[key]!) : undefined);

  // A new scheme starts from today by default (the owner can change the date).
  const chooseScheme = (scheme: SettingsDraft["gstScheme"]) => {
    setDraft({
      ...draft,
      gstScheme: scheme,
      schemeFrom: scheme === saved.gstScheme ? saved.schemeFrom : todayISO(),
    });
  };

  const setPreset = (index: number, value: string) => {
    const presets = [...draft.deliveryPresets];
    presets[index] = value;
    setDraft({ ...draft, deliveryPresets: presets });
  };

  const onSave = async () => {
    const result = fromDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      toast(t("settings.fixErrors"), "error");
      const first = Object.keys(result.errors)[0];
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    if (result.settings.gstScheme !== saved.gstScheme) {
      const toRegular = result.settings.gstScheme === "regular";
      const ok = await confirm({
        title: t(toRegular ? "settings.gst.toRegularTitle" : "settings.gst.toCompositionTitle"),
        message: t(toRegular ? "settings.gst.toRegularMessage" : "settings.gst.toCompositionMessage", {
          date: formatDate(result.settings.schemeFrom, i18n.language),
        }),
        confirmLabel: t("settings.gst.yesSwitch"),
        tone: toRegular ? "danger" : "primary",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await saveSettings(result.settings);
      const d = toDraft(result.settings);
      setSaved(d);
      setDraft(d);
      setErrors({});
      toast(t("settings.saved"));
    } catch (err) {
      console.error(err);
      toast(t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  const prefix = draft.billPrefix.trim().toUpperCase();
  const sequence = Number(draft.nextBillNumber);
  const billNumberPreview =
    isValidBillPrefix(prefix) && Number.isInteger(sequence) && sequence >= 1 && sequence <= 99999
      ? formatBillNumber(prefix, new Date(), sequence)
      : "—";
  const compositionRate = parsePercent(draft.compositionRate);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-28">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("settings.title")}</h1>
        <p className="mt-1 text-[15px] text-slate-500">{t("settings.subtitle")}</p>
      </div>

      {/* Shop details */}
      <Card>
        <CardHeader icon={Store} title={t("settings.shop.title")} description={t("settings.shop.description")} />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("settings.shop.shopName")}
            htmlFor={fieldId("shopName")}
            error={errorText("shopName")}
            className="sm:col-span-2"
          >
            <Input
              id={fieldId("shopName")}
              value={draft.shopName}
              onChange={(e) => set("shopName", e.target.value)}
              invalid={!!errors.shopName}
            />
          </Field>
          <Field
            label={t("settings.shop.address")}
            htmlFor={fieldId("address")}
            error={errorText("address")}
            className="sm:col-span-2"
          >
            <Textarea
              id={fieldId("address")}
              rows={2}
              value={draft.address}
              onChange={(e) => set("address", e.target.value)}
              invalid={!!errors.address}
            />
          </Field>
          <Field label={t("settings.shop.phone")} htmlFor={fieldId("phone")} error={errorText("phone")}>
            <Input
              id={fieldId("phone")}
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(e) => set("phone", e.target.value)}
              invalid={!!errors.phone}
            />
          </Field>
          <Field
            label={t("settings.shop.gstin")}
            optional={t("common.optional")}
            htmlFor={fieldId("gstin")}
            hint={t("settings.shop.gstinHint")}
            error={errorText("gstin")}
          >
            <Input
              id={fieldId("gstin")}
              value={draft.gstin}
              maxLength={15}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              invalid={!!errors.gstin}
              className="font-mono uppercase"
            />
          </Field>
          <Field
            label={t("settings.shop.upiId")}
            optional={t("common.optional")}
            htmlFor={fieldId("upiId")}
            hint={t("settings.shop.upiIdHint")}
            error={errorText("upiId")}
            className="sm:col-span-2"
          >
            <Input
              id={fieldId("upiId")}
              value={draft.upiId}
              onChange={(e) => set("upiId", e.target.value.trim())}
              invalid={!!errors.upiId}
              autoCapitalize="off"
              spellCheck={false}
            />
          </Field>
          <Field
            label={t("settings.shop.billTerms")}
            htmlFor={fieldId("billTerms")}
            hint={t("settings.shop.billTermsHint")}
            className="sm:col-span-2"
          >
            <Textarea
              id={fieldId("billTerms")}
              rows={4}
              value={draft.billTerms}
              onChange={(e) => set("billTerms", e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      {/* GST */}
      <Card>
        <CardHeader icon={Landmark} title={t("settings.gst.title")} description={t("settings.gst.description")} />
        <CardBody className="flex flex-col gap-5">
          <div role="radiogroup" aria-label={t("settings.gst.title")} className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              selected={draft.gstScheme === "composition"}
              onSelect={() => chooseScheme("composition")}
              title={t("settings.gst.composition")}
              text={t("settings.gst.compositionText", {
                rate: compositionRate === null ? "1%" : formatPercent(compositionRate),
              })}
            />
            <RadioCard
              selected={draft.gstScheme === "regular"}
              onSelect={() => chooseScheme("regular")}
              title={t("settings.gst.regular")}
              text={t("settings.gst.regularText")}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t("settings.gst.schemeFrom")}
              htmlFor={fieldId("schemeFrom")}
              error={errorText("schemeFrom")}
              // Date boxes follow the browser's own date order; spell the date out so 1 Apr and 4 Jan can't be confused.
              hint={/^\d{4}-\d{2}-\d{2}$/.test(draft.schemeFrom) ? formatDate(draft.schemeFrom, i18n.language) : undefined}
            >
              <Input
                id={fieldId("schemeFrom")}
                type="date"
                value={draft.schemeFrom}
                onChange={(e) => set("schemeFrom", e.target.value)}
                invalid={!!errors.schemeFrom}
              />
            </Field>
            {draft.gstScheme === "composition" ? (
              <Field
                label={t("settings.gst.compositionRate")}
                htmlFor={fieldId("compositionRate")}
                error={errorText("compositionRate")}
              >
                <Input
                  id={fieldId("compositionRate")}
                  inputMode="decimal"
                  suffix="%"
                  value={draft.compositionRate}
                  onChange={(e) => set("compositionRate", e.target.value)}
                  invalid={!!errors.compositionRate}
                />
              </Field>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* Bill numbers */}
      <Card>
        <CardHeader
          icon={FileText}
          title={t("settings.billNumbers.title")}
          description={t("settings.billNumbers.description")}
        />
        <CardBody className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t("settings.billNumbers.prefix")}
              htmlFor={fieldId("billPrefix")}
              hint={t("settings.billNumbers.prefixHint")}
              error={errorText("billPrefix")}
            >
              <Input
                id={fieldId("billPrefix")}
                value={draft.billPrefix}
                maxLength={4}
                onChange={(e) => set("billPrefix", e.target.value.toUpperCase())}
                invalid={!!errors.billPrefix}
                className="font-mono uppercase"
              />
            </Field>
            <Field
              label={t("settings.billNumbers.next")}
              htmlFor={fieldId("nextBillNumber")}
              hint={t("settings.billNumbers.nextHint")}
              error={errorText("nextBillNumber")}
            >
              <Input
                id={fieldId("nextBillNumber")}
                inputMode="numeric"
                value={draft.nextBillNumber}
                onChange={(e) => set("nextBillNumber", e.target.value.replace(/\D/g, "").slice(0, 5))}
                invalid={!!errors.nextBillNumber}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-[15px] text-slate-600">{t("settings.billNumbers.preview")}</span>
            <span className="font-mono text-lg font-semibold text-slate-900">{billNumberPreview}</span>
          </div>
        </CardBody>
      </Card>

      {/* Rates and charges */}
      <Card>
        <CardHeader icon={Percent} title={t("settings.rates.title")} description={t("settings.rates.description")} />
        <CardBody className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              label={t("settings.rates.scrapRate")}
              htmlFor={fieldId("scrapRatePerKg")}
              error={errorText("scrapRatePerKg")}
            >
              <Input
                id={fieldId("scrapRatePerKg")}
                inputMode="decimal"
                prefix="₹"
                suffix={t("settings.rates.perKg")}
                value={draft.scrapRatePerKg}
                onChange={(e) => set("scrapRatePerKg", e.target.value)}
                invalid={!!errors.scrapRatePerKg}
              />
            </Field>
            <Field
              label={t("settings.rates.debitCard")}
              htmlFor={fieldId("debitCardCharge")}
              error={errorText("debitCardCharge")}
            >
              <Input
                id={fieldId("debitCardCharge")}
                inputMode="decimal"
                suffix="%"
                value={draft.debitCardCharge}
                onChange={(e) => set("debitCardCharge", e.target.value)}
                invalid={!!errors.debitCardCharge}
              />
            </Field>
            <Field
              label={t("settings.rates.creditCard")}
              htmlFor={fieldId("creditCardCharge")}
              error={errorText("creditCardCharge")}
            >
              <Input
                id={fieldId("creditCardCharge")}
                inputMode="decimal"
                suffix="%"
                value={draft.creditCardCharge}
                onChange={(e) => set("creditCardCharge", e.target.value)}
                invalid={!!errors.creditCardCharge}
              />
            </Field>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">{t("settings.rates.delivery")}</p>
            <p className="text-sm text-slate-500">{t("settings.rates.deliveryHint")}</p>
            <div className="mt-2.5 flex flex-wrap items-start gap-2">
              {draft.deliveryPresets.map((value, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    id={fieldId(`deliveryPresets.${i}`)}
                    inputMode="decimal"
                    prefix="₹"
                    value={value}
                    onChange={(e) => setPreset(i, e.target.value)}
                    invalid={!!errors[`deliveryPresets.${i}`]}
                    className="w-28"
                    aria-label={`${t("settings.rates.delivery")} ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, deliveryPresets: draft.deliveryPresets.filter((_, j) => j !== i) })
                    }
                    aria-label={t("common.remove")}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {draft.deliveryPresets.length < 6 ? (
                <Button
                  variant="ghost"
                  icon={Plus}
                  onClick={() => setDraft({ ...draft, deliveryPresets: [...draft.deliveryPresets, ""] })}
                >
                  {t("settings.rates.addAmount")}
                </Button>
              ) : null}
            </div>
            {Object.keys(errors).some((k) => k.startsWith("deliveryPresets.")) ? (
              <p className="mt-1.5 text-sm text-red-600">{t("validation.amount")}</p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <PeopleSection />

      {/* Backup — built in week 2 */}
      <Card>
        <CardHeader
          icon={DatabaseBackup}
          title={t("settings.backup.title")}
          description={t("settings.backup.description")}
        />
        <CardBody className="flex flex-wrap items-center gap-3">
          <Badge tone="amber">{t("comingSoon.beingBuilt")}</Badge>
          <span className="inline-flex items-center gap-1.5 text-[15px] text-slate-700">
            <CalendarClock className="size-4 text-brand-700" />
            {t("comingSoon.readyBy", { date: formatDate(BACKUP_READY_BY, i18n.language) })}
          </span>
        </CardBody>
      </Card>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgb(15_23_42/0.08)] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-slate-700">{t("common.unsavedChanges")}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(saved);
                  setErrors({});
                }}
              >
                {t("common.discard")}
              </Button>
              <Button loading={saving} onClick={() => void onSave()}>
                {saving ? t("common.saving") : t("common.saveChanges")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
