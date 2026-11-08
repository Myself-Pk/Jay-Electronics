import { useEffect, useState } from "react";
import { CircleCheck, DatabaseBackup, MoonStar, Plus, Receipt, Scale, Share2, TriangleAlert, Wallet, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { buttonClasses, Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toast";
import { getBackupStatus } from "@/data/dashboard";
import { asBillError } from "@/data/errors";
import { cancelExpense, closeDay, getDayClose, getLastOpeningCash, getReport } from "@/data/reports";
import { getSettings } from "@/data/settings";
import { canSeeOwnerData } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDate, formatLongDate, formatTime, parseISODate, todayISO } from "@/lib/dates";
import { formatRupees, fromPaise, paiseToInput, parseRupees } from "@/lib/money";
import { expectedCash, type Report } from "@/lib/report";
import { whatsAppShareUrl } from "@/lib/share";
import { useAsync } from "@/lib/useAsync";
import { MODE_ICONS } from "../bills/PaymentSection";
import { ExpenseDialog } from "./ExpenseDialog";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Money in without the Bajaj loan (Bajaj pays the shop later). */
const receivedNow = (r: Report) => r.moneyIn.filter((m) => m.mode !== "bajaj").reduce((s, m) => s + m.amount, 0);

function shareText(t: T, shop: string, dateLabel: string, r: Report, expected: number, counted: number | null) {
  const lines = [
    t("closeDay.shareTitle", { shop, date: dateLabel }),
    "",
    `${t("closeDay.sales")}: ${formatRupees(r.sales)} (${t("closeDay.billCount", { count: r.billCount })})`,
    `${t("closeDay.moneyIn")}: ${formatRupees(receivedNow(r))}`,
    ...r.moneyIn.map(
      (m) => `  • ${t(`modes.${m.mode}`)}: ${formatRupees(m.amount)}${m.mode === "bajaj" ? ` (${t("closeDay.paysLater")})` : ""}`,
    ),
    `${t("closeDay.udhaarGiven")}: ${formatRupees(r.udhaarGiven)}`,
    `${t("closeDay.expenses")}: ${formatRupees(r.expensesTotal)}`,
    `${t("closeDay.expected")}: ${formatRupees(expected)}`,
  ];
  if (counted !== null) lines.push(`${t("closeDay.confirmCounted")}: ${formatRupees(counted)}`);
  return lines.join("\n");
}

export function CloseDayPage() {
  const { t, i18n } = useTranslation();
  const { person } = useSession();
  const confirm = useConfirm();
  const toast = useToast();
  const isOwner = canSeeOwnerData(person?.role);
  const [day, setDay] = useState(todayISO());
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const report = useAsync(() => getReport(day, day, person?.role), [day, person?.role, version]);
  const closed = useAsync(() => getDayClose(day), [day, version]);
  const lastOpening = useAsync(() => getLastOpeningCash(day), [day]);
  const backup = useAsync(getBackupStatus);
  const settings = useAsync(getSettings);
  const [openingText, setOpeningText] = useState("");
  const [countedText, setCountedText] = useState("");
  const [note, setNote] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fill in the start-of-day cash from this day's close, or else from the last closed day.
  useEffect(() => {
    if (closed.loading || lastOpening.loading) return;
    const c = closed.data;
    setOpeningText(paiseToInput(c ? c.openingCash : (lastOpening.data ?? 0)));
    setCountedText(c?.countedCash != null ? paiseToInput(c.countedCash) : "");
    setNote(c?.note ?? "");
    // Only when the day (or its saved close) changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, closed.loading, lastOpening.loading, closed.data?.closedAt]);

  const r = report.data?.report;
  const opening = parseRupees(openingText);
  const counted = countedText.trim() === "" ? null : parseRupees(countedText);
  const openingOk = opening !== null && opening >= 0;
  const countedOk = countedText.trim() === "" || (counted !== null && counted >= 0);
  const expected = r && openingOk ? expectedCash(opening, r.cash) : null;
  const difference = expected !== null && counted !== null && countedOk ? counted - expected : null;
  const dateLabel = formatLongDate(parseISODate(day), i18n.language);

  const save = async () => {
    if (!r || !person || opening === null || expected === null || !countedOk) return;
    const ok = await confirm({
      title: t("closeDay.confirmTitle", { date: formatDate(day, i18n.language) }),
      lines: [
        { label: t("closeDay.sales"), value: formatRupees(r.sales) },
        { label: t("closeDay.moneyIn"), value: formatRupees(receivedNow(r)) },
        { label: t("closeDay.expenses"), value: formatRupees(r.expensesTotal) },
        { label: t("closeDay.expected"), value: formatRupees(expected) },
        { label: t("closeDay.confirmCounted"), value: counted === null ? t("closeDay.notCounted") : formatRupees(counted) },
      ],
      confirmLabel: t("closeDay.confirmYes"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await closeDay(
        {
          day,
          openingCash: opening,
          countedCash: counted,
          note: note.trim(),
          expectedCash: expected,
          summary: {
            sales: fromPaise(r.sales),
            bills: r.billCount,
            money_in: Object.fromEntries(r.moneyIn.map((m) => [m.mode, fromPaise(m.amount)])),
            udhaar_given: fromPaise(r.udhaarGiven),
            udhaar_collected: fromPaise(r.udhaarCollected),
            expenses: fromPaise(r.expensesTotal),
          },
        },
        person,
      );
      toast(t("closeDay.closed"));
      reload();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onCancelExpense = async (id: string, amount: number) => {
    if (!person) return;
    const ok = await confirm({
      title: t("closeDay.expenseCancelConfirm", { amount: formatRupees(amount) }),
      confirmLabel: t("closeDay.expenseCancelYes"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await cancelExpense(id, person.role);
      toast(t("closeDay.expenseCancelled"));
      reload();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
          <MoonStar className="size-7 text-brand-800" />
          {t("closeDay.title")}
        </h1>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          {t("closeDay.day")}
          <Input type="date" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-44" />
        </label>
      </div>
      <p className="-mt-3 text-[15px] text-slate-500">{dateLabel}</p>

      {closed.data ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">
              {t("closeDay.closedBanner", { time: formatTime(closed.data.closedAt, i18n.language), name: closed.data.by ?? "—" })}
            </p>
            <p className="text-sm text-emerald-800">{t("closeDay.closeAgainHint")}</p>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label={t("closeDay.sales")} value={r ? formatRupees(r.sales, { paise: "never" }) : null} sub={r ? t("closeDay.billCount", { count: r.billCount }) : null} />
        <StatTile label={t("closeDay.moneyIn")} value={r ? formatRupees(receivedNow(r), { paise: "never" }) : null} tone="green" />
        <StatTile label={t("closeDay.udhaarGiven")} value={r ? formatRupees(r.udhaarGiven, { paise: "never" }) : null} tone={r && r.udhaarGiven > 0 ? "red" : undefined} />
        <StatTile label={t("closeDay.expenses")} value={r ? formatRupees(r.expensesTotal, { paise: "never" }) : null} />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title={t("closeDay.moneyByMode")} icon={Wallet} />
            {!r ? (
              <div className="m-5 h-24 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <>
                {r.moneyIn.length === 0 ? (
                  <p className="px-6 py-5 text-[15px] text-slate-500">{t("closeDay.noMoney")}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {r.moneyIn.map((m) => {
                      const Icon = MODE_ICONS[m.mode];
                      return (
                        <li key={m.mode} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                          <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                            <Icon className="size-5" />
                          </span>
                          <span className="flex-1 text-[15px] font-medium text-slate-800">{t(`modes.${m.mode}`)}</span>
                          <span className={cn("text-lg font-semibold tabular-nums", m.mode === "bajaj" ? "text-slate-500" : "text-emerald-700")}>
                            {formatRupees(m.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="space-y-1 border-t border-slate-100 px-5 py-3 text-sm text-slate-600 sm:px-6">
                  {r.udhaarCollected > 0 ? <p>{t("closeDay.oldUdhaar", { amount: formatRupees(r.udhaarCollected) })}</p> : null}
                  {r.moneyIn.some((m) => m.mode === "bajaj") ? <p>{t("closeDay.bajajLater")}</p> : null}
                  {r.moneyOutTotal > 0 ? <p>{t("closeDay.refunds", { amount: formatRupees(r.moneyOutTotal) })}</p> : null}
                  {r.cancelledCount > 0 ? (
                    <p className="text-amber-700">{t("closeDay.cancelled", { count: r.cancelledCount, amount: formatRupees(r.cancelledAmount) })}</p>
                  ) : null}
                </div>
              </>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t("closeDay.expensesTitle")}
              icon={Receipt}
              actions={
                <Button size="sm" variant="secondary" icon={Plus} onClick={() => setExpenseOpen(true)} disabled={!person}>
                  {t("closeDay.addExpense")}
                </Button>
              }
            />
            {!r ? (
              <div className="m-5 h-16 animate-pulse rounded-xl bg-slate-100" />
            ) : r.expenses.length === 0 ? (
              <p className="px-6 py-5 text-[15px] text-slate-500">{t("closeDay.noExpenses")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {r.expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-slate-800">
                        {t(`closeDay.cats.${e.category}`, { defaultValue: e.category })}
                      </span>
                      <span className="block truncate text-sm text-slate-500">
                        {t(`modes.${e.mode}`)}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">{formatRupees(e.amount)}</span>
                    {isOwner ? (
                      <button
                        type="button"
                        onClick={() => void onCancelExpense(e.id, e.amount)}
                        className="flex size-11 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={t("closeDay.expenseCancel")}
                        title={t("closeDay.expenseCancel")}
                      >
                        <X className="size-5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader title={t("closeDay.cashCheck")} description={t("closeDay.cashCheckHint")} icon={Scale} />
            <CardBody className="flex flex-col gap-4">
              <Field label={t("closeDay.opening")} htmlFor="cd-opening" hint={t("closeDay.openingHint")}>
                <Input id="cd-opening" inputMode="decimal" prefix="₹" value={openingText} onChange={(e) => setOpeningText(e.target.value)} invalid={!openingOk} />
              </Field>
              {r ? (
                <dl className="space-y-1.5 text-[15px]">
                  <div className="flex justify-between">
                    <dt className="text-slate-600">+ {t("closeDay.cashIn")}</dt>
                    <dd className="font-medium text-emerald-700 tabular-nums">{formatRupees(r.cash.in)}</dd>
                  </div>
                  {r.cash.out > 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-slate-600">− {t("closeDay.cashOut")}</dt>
                      <dd className="font-medium tabular-nums">{formatRupees(r.cash.out)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-slate-600">− {t("closeDay.cashExpenses")}</dt>
                    <dd className="font-medium tabular-nums">{formatRupees(r.cash.expenses)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                    <dt className="font-bold text-slate-900">{t("closeDay.expected")}</dt>
                    <dd className="text-xl font-bold text-slate-900 tabular-nums">{expected === null ? "—" : formatRupees(expected)}</dd>
                  </div>
                </dl>
              ) : null}
              <Field label={t("closeDay.counted")} htmlFor="cd-counted" hint={t("closeDay.countedHint")}>
                <Input
                  id="cd-counted"
                  inputMode="decimal"
                  prefix="₹"
                  value={countedText}
                  onChange={(e) => setCountedText(e.target.value)}
                  invalid={!countedOk}
                  className="text-lg font-semibold"
                />
              </Field>
              {difference !== null ? (
                <p
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold",
                    difference === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800",
                  )}
                  role="status"
                >
                  {difference === 0 ? <CircleCheck className="size-5" /> : <TriangleAlert className="size-5" />}
                  {difference === 0
                    ? t("closeDay.matches")
                    : t(difference < 0 ? "closeDay.short" : "closeDay.extra", { amount: formatRupees(Math.abs(difference)) })}
                </p>
              ) : null}
              <Field label={t("closeDay.note")} htmlFor="cd-note" optional={t("common.optional")}>
                <Textarea id="cd-note" rows={2} maxLength={500} value={note} placeholder={t("closeDay.noteHint")} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </CardBody>
          </Card>

          <p className="flex items-start gap-2 px-1 text-sm text-slate-600">
            {backup.data?.state === "done" && day === todayISO() ? (
              <>
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {t("closeDay.backupDone", { time: formatTime(backup.data.at, i18n.language) })}
              </>
            ) : (
              <>
                <DatabaseBackup className="mt-0.5 size-4 shrink-0 text-slate-400" />
                {t("closeDay.backupAuto")}
              </>
            )}
          </p>

          <Button size="xl" icon={MoonStar} disabled={!r || !person || expected === null || !countedOk} loading={saving} onClick={() => void save()}>
            {closed.data ? t("closeDay.closeAgain") : t("closeDay.close")}
          </Button>
          {r && expected !== null ? (
            <a
              href={whatsAppShareUrl(shareText(t, settings.data?.shopName ?? "Jay Electronics", formatDate(day, i18n.language), r, expected, counted))}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses("secondary", "lg")}
            >
              <Share2 className="size-5" />
              {t("closeDay.share")}
            </a>
          ) : null}
        </div>
      </div>

      {person ? <ExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} onSaved={reload} day={day} person={person} /> : null}
    </div>
  );
}
