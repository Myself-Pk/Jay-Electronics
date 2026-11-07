import { useState, type ComponentType } from "react";
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Landmark,
  MessageCircle,
  Pencil,
  Printer,
  RotateCcw,
  Smartphone,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { BillPaymentMode, PaymentMode } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatPercent, formatRupees, paiseToInput } from "@/lib/money";
import { newKey, type BillDraft, type DraftFinance, type DraftPayment, type Evaluated } from "./billDraft";

type Icon = ComponentType<{ className?: string }>;

export const MODE_ICONS: Record<PaymentMode, Icon> = {
  cash: Banknote,
  upi: Smartphone,
  debit_card: CreditCard,
  credit_card: CreditCard,
  bajaj: Landmark,
  bank: Landmark,
};

const BUTTON_MODES: PaymentMode[] = ["cash", "upi", "debit_card", "credit_card", "bajaj"];

interface Props {
  draft: BillDraft;
  ev: Evaluated;
  saving: boolean;
  canWhatsApp: boolean;
  onPaymentsChange: (payments: DraftPayment[]) => void;
  onFinanceChange: (finance: DraftFinance | null) => void;
  onSave: (then: "print" | "whatsapp") => void;
  onStartAgain: () => void;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" | "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px]">
      <span className={tone === "muted" ? "text-slate-500" : "text-slate-600"}>{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "green" && "text-emerald-700",
          tone === "red" && "text-red-600",
          !tone && "text-slate-900",
          tone === "muted" && "text-slate-500",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function PaymentSection({ draft, ev, saving, canWhatsApp, onPaymentsChange, onFinanceChange, onSave, onStartAgain }: Props) {
  const { t } = useTranslation();
  const [editingCharges, setEditingCharges] = useState<string | null>(null);
  const { totals } = ev;
  const itemCount = draft.lines.reduce((n, l) => n + l.qty, 0);

  const updatePayment = (key: string, patch: Partial<DraftPayment>) =>
    onPaymentsChange(draft.payments.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addMode = (mode: PaymentMode) => {
    const due = totals.balance > 0 ? paiseToInput(totals.balance) : "";
    if (mode === "bajaj") {
      if (!draft.finance) onFinanceChange({ loanText: due, chargesText: "", reference: "" });
      window.setTimeout(() => document.getElementById("bajaj-loan")?.focus(), 0);
      return;
    }
    const existing = draft.payments.find((p) => p.mode === mode);
    if (existing) {
      document.getElementById(`pay-${existing.key}`)?.focus();
      return;
    }
    const key = newKey();
    onPaymentsChange([
      ...draft.payments,
      { key, mode: mode as BillPaymentMode, amountText: due, chargesText: "", chargesEdited: false },
    ]);
    window.setTimeout(() => (document.getElementById(`pay-${key}`) as HTMLInputElement | null)?.select(), 0);
  };

  const used = new Set<PaymentMode>([...draft.payments.map((p) => p.mode), ...(draft.finance ? (["bajaj"] as const) : [])]);
  const blocking = ev.problems;

  return (
    <div className="flex flex-col gap-4">
      {/* Totals */}
      <Card className="p-5">
        <p className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t("newBill.summary")}</p>
        <div className="mt-3 flex flex-col gap-1.5">
          <Row label={t("newBill.itemsTotal", { count: itemCount })} value={formatRupees(totals.subtotal)} />
          {totals.scrapCredit > 0 ? (
            <Row label={t("newBill.lessOldBattery")} value={`− ${formatRupees(totals.scrapCredit)}`} tone="green" />
          ) : null}
          {totals.extraCharges > 0 ? <Row label={t("newBill.charges")} value={formatRupees(totals.extraCharges)} /> : null}
          {totals.roundOff !== 0 ? (
            <Row label={t("newBill.roundOff")} value={formatRupees(totals.roundOff, { paise: "always" })} tone="muted" />
          ) : null}
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
          <span className="text-base font-bold text-slate-900">{t("newBill.totalToPay")}</span>
          <span className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{formatRupees(totals.total)}</span>
        </div>
      </Card>

      {/* Payment */}
      <Card className="p-5">
        <p className="text-[15px] font-semibold text-slate-900">{t("newBill.howPaying")}</p>
        <p className="text-sm text-slate-500">{t("newBill.payHint")}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BUTTON_MODES.map((mode) => {
            const ModeIcon = MODE_ICONS[mode];
            return (
              <button
                key={mode}
                type="button"
                onClick={() => addMode(mode)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors",
                  used.has(mode)
                    ? "border-brand-700 bg-brand-50 text-brand-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-slate-50",
                  mode === "bajaj" && "col-span-1",
                )}
              >
                <ModeIcon className="size-5" />
                {t(`modes.${mode}`)}
              </button>
            );
          })}
        </div>

        {draft.payments.length > 0 || draft.finance ? (
          <ul className="mt-4 flex flex-col gap-3">
            {draft.payments.map((p, i) => {
              const ModeIcon = MODE_ICONS[p.mode];
              const evp = ev.payments[i];
              const isCard = p.mode === "debit_card" || p.mode === "credit_card";
              return (
                <li key={p.key} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <ModeIcon className="size-5 shrink-0 text-slate-500" />
                    <label htmlFor={`pay-${p.key}`} className="flex-1 text-[15px] font-semibold text-slate-800">
                      {t(`modes.${p.mode}`)}
                    </label>
                    <Input
                      id={`pay-${p.key}`}
                      inputMode="decimal"
                      prefix="₹"
                      value={p.amountText}
                      onChange={(e) => updatePayment(p.key, { amountText: e.target.value })}
                      invalid={evp?.towards === null || (evp?.towards ?? 0) <= 0}
                      className="w-36 text-right text-[16px] font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => onPaymentsChange(draft.payments.filter((x) => x.key !== p.key))}
                      aria-label={t("common.remove")}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  {isCard && evp ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-sm text-slate-600">
                      {editingCharges === p.key ? (
                        <Input
                          autoFocus
                          inputMode="decimal"
                          prefix="₹"
                          aria-label={t("newBill.editCharges")}
                          value={p.chargesEdited ? p.chargesText : paiseToInput(evp.charges)}
                          onChange={(e) => updatePayment(p.key, { chargesText: e.target.value, chargesEdited: true })}
                          onBlur={() => setEditingCharges(null)}
                          className="h-9 w-28"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingCharges(p.key)}
                          className="inline-flex items-center gap-1 rounded-md hover:text-brand-800"
                          title={t("newBill.editCharges")}
                        >
                          {t("newBill.cardCharges", { amount: formatRupees(evp.charges), rate: formatPercent(evp.rate) })}
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      <span className="ml-auto font-semibold text-slate-900">
                        {t("newBill.swipe", { amount: formatRupees((evp.towards ?? 0) + evp.charges) })}
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {draft.finance ? (
              <li className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <Landmark className="size-5 shrink-0 text-slate-500" />
                  <span className="flex-1 text-[15px] font-semibold text-slate-800">{t("modes.bajaj")}</span>
                  <button
                    type="button"
                    onClick={() => onFinanceChange(null)}
                    aria-label={t("common.remove")}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 pl-7">
                  <label className="col-span-2 text-xs font-semibold text-slate-500" htmlFor="bajaj-loan">
                    {t("newBill.bajajLoan")}
                    <Input
                      id="bajaj-loan"
                      inputMode="decimal"
                      prefix="₹"
                      value={draft.finance.loanText}
                      onChange={(e) => onFinanceChange({ ...draft.finance!, loanText: e.target.value })}
                      invalid={!ev.finance?.loanAmount}
                      className="mt-1 text-[16px] font-semibold"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500" htmlFor="bajaj-charges">
                    {t("newBill.bajajCharges")}
                    <Input
                      id="bajaj-charges"
                      inputMode="decimal"
                      prefix="₹"
                      value={draft.finance.chargesText}
                      onChange={(e) => onFinanceChange({ ...draft.finance!, chargesText: e.target.value })}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-500" htmlFor="bajaj-ref">
                    {t("newBill.bajajReference")}
                    <Input
                      id="bajaj-ref"
                      value={draft.finance.reference}
                      onChange={(e) => onFinanceChange({ ...draft.finance!, reference: e.target.value })}
                      className="mt-1"
                    />
                  </label>
                </div>
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-col gap-1.5 border-t border-slate-200 pt-3">
          <Row label={t("newBill.paid")} value={formatRupees(totals.paid)} tone="green" />
          {totals.balance > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-semibold text-red-600">{t("newBill.udhaar")}</span>
              <span className="text-xl font-bold text-red-600 tabular-nums">{formatRupees(totals.balance)}</span>
            </div>
          ) : totals.total > 0 && totals.balance === 0 ? (
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700">
              <CircleCheck className="size-5" />
              {t("newBill.fullyPaid")}
            </p>
          ) : null}
        </div>
      </Card>

      {/* Problems, warnings, save */}
      {blocking.length > 0 && draft.lines.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
          {blocking.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-medium text-red-700">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {t(`newBill.problems.${p.key}`, p.params)}
            </li>
          ))}
        </ul>
      ) : null}
      {ev.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          {ev.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-sm font-medium text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t(`newBill.warnings.${w.key}`, w.params)}
            </li>
          ))}
        </ul>
      ) : null}

      <Button size="xl" icon={Printer} disabled={blocking.length > 0} loading={saving} onClick={() => onSave("print")}>
        {t("newBill.saveAndPrint")}
      </Button>
      <Button
        size="lg"
        variant="success"
        icon={MessageCircle}
        disabled={blocking.length > 0 || !canWhatsApp || saving}
        onClick={() => onSave("whatsapp")}
      >
        {t("newBill.saveAndWhatsApp")}
      </Button>
      {draft.lines.length > 0 || draft.customer.phone || draft.customer.id ? (
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onStartAgain} className="self-center">
          {t("newBill.startAgain")}
        </Button>
      ) : null}
    </div>
  );
}
