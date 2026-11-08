import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { asBillError } from "@/data/errors";
import { addExpense, EXPENSE_CATEGORIES, type ExpenseMode } from "@/data/reports";
import type { Person } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatRupees, parseRupees } from "@/lib/money";

/** "Add expense": what it was for, how much, how it was paid. Asks before saving. */
export function ExpenseDialog({ open, onClose, onSaved, day, person }: { open: boolean; onClose: () => void; onSaved: () => void; day: string; person: Person }) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const [category, setCategory] = useState<string>("tea");
  const [amountText, setAmountText] = useState("");
  const [mode, setMode] = useState<ExpenseMode>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("tea");
      setAmountText("");
      setMode("cash");
      setNote("");
    }
  }, [open]);

  const amount = parseRupees(amountText);
  const valid = amount !== null && amount > 0;

  const save = async () => {
    if (!valid) return;
    const ok = await confirm({
      title: t("closeDay.expenseConfirm", { amount: formatRupees(amount) }),
      lines: [
        { label: t("closeDay.expenseKind"), value: t(`closeDay.cats.${category}`) },
        { label: t("closeDay.expensePaidBy"), value: t(`modes.${mode}`) },
        { label: t("closeDay.day"), value: formatDate(day, i18n.language) },
        ...(note.trim() ? [{ label: t("closeDay.expenseNote"), value: note.trim() }] : []),
      ],
      confirmLabel: t("closeDay.addExpense"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await addExpense({ category, amount, mode, note: note.trim(), date: day }, person);
      toast(t("closeDay.expenseSaved"));
      onSaved();
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
      title={t("closeDay.expenseDialogTitle")}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" disabled={!valid} loading={saving} onClick={() => void save()}>
            {t("closeDay.addExpense")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t("closeDay.expenseKind")}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={cn(
                  "min-h-12 rounded-xl border px-3 text-[15px] font-semibold",
                  category === c ? "border-brand-700 bg-brand-50 text-brand-900" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300",
                )}
              >
                {t(`closeDay.cats.${c}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t("closeDay.expenseAmount")} htmlFor="exp-amount" className="w-44">
            <Input
              id="exp-amount"
              inputMode="decimal"
              prefix="₹"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              invalid={amountText !== "" && !valid}
              className="text-lg font-semibold"
              data-autofocus
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">{t("closeDay.expensePaidBy")}</span>
            <Segmented<ExpenseMode>
              label={t("closeDay.expensePaidBy")}
              value={mode}
              onChange={setMode}
              options={(["cash", "upi", "bank"] as const).map((m) => ({ value: m, label: t(`modes.${m}`) }))}
            />
          </div>
        </div>
        <Field label={t("closeDay.expenseNote")} htmlFor="exp-note" optional={t("common.optional")} hint={t("closeDay.expenseNoteHint")}>
          <Input id="exp-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
