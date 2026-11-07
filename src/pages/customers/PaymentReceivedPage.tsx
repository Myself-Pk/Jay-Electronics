import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { CircleCheck, IndianRupee, Landmark, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/auth/LoginScreen";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/Confirm";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { asBillError } from "@/data/errors";
import {
  listCustomerBills,
  listCustomerDues,
  listPendingFinance,
  receivePayment,
  settleFinance,
} from "@/data/payments";
import type { BillPaymentModeNoBajaj, CustomerDues, PendingFinance } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDate, todayISO } from "@/lib/dates";
import { formatRupees, paiseToInput, parseRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { formatPhone } from "../bills/CustomerSection";
import { MODE_ICONS } from "../bills/PaymentSection";

const MODES: BillPaymentModeNoBajaj[] = ["cash", "upi", "debit_card", "credit_card", "bank"];

function errorText(t: (k: string, o?: Record<string, unknown>) => string, err: unknown) {
  const be = asBillError(err);
  return be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong");
}

/** Udhaar paid by a customer: applied to their oldest unpaid bills first. */
function FromCustomer({ initialCustomerId }: { initialCustomerId?: string }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const customers = useAsync(listCustomerDues);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<CustomerDues | null>(null);
  const [amountText, setAmountText] = useState("");
  const [mode, setMode] = useState<BillPaymentModeNoBajaj>("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const bills = useAsync(() => (chosen ? listCustomerBills(chosen) : Promise.resolve([])), [chosen?.id]);

  useEffect(() => {
    if (!chosen && initialCustomerId && customers.data) {
      const c = customers.data.find((x) => x.id === initialCustomerId);
      if (c) pick(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.data, initialCustomerId]);

  const pick = (c: CustomerDues) => {
    setChosen(c);
    setAmountText(c.dues > 0 ? paiseToInput(c.dues) : "");
    setReference("");
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (customers.data ?? [])
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone ?? "").includes(digits)))
      .sort((a, b) => b.dues - a.dues || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [customers.data, query]);

  const amount = parseRupees(amountText);
  const valid = chosen !== null && amount !== null && amount > 0 && amount <= chosen.dues;
  const unpaid = (bills.data ?? []).filter((b) => b.status === "saved" && b.balance > 0).reverse();

  const save = async () => {
    if (!chosen || !valid) return;
    const ok = await confirm({
      title: t("payment.confirmTitle", { amount: formatRupees(amount!), name: chosen.name }),
      lines: [
        { label: t("payment.confirmMode"), value: t(`modes.${mode}`) },
        { label: t("payment.confirmLeft"), value: formatRupees(chosen.dues - amount!) },
      ],
      confirmLabel: t("payment.confirmYes"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      await receivePayment({ customerId: chosen.id, amount: amount!, mode, reference: reference.trim() });
      toast(t("payment.saved", { amount: formatRupees(amount!), name: chosen.name }));
      navigate(`/customers/${chosen.id}`);
    } catch (err) {
      toast(errorText(t, err), "error");
    } finally {
      setSaving(false);
    }
  };

  if (!chosen) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">{t("payment.findPlaceholder")}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("payment.findPlaceholder")}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-11 text-[15px] shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
            />
          </label>
          <p className="text-sm text-slate-500">{t("payment.pickHint")}</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {list.map((c, i) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50">
                  <Avatar name={c.name} index={i} className="size-10 text-base" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">{c.name}</span>
                    <span className="block text-sm text-slate-500">{c.phone ? formatPhone(c.phone) : ""}</span>
                  </span>
                  <span className={c.dues > 0 ? "font-bold text-red-600 tabular-nums" : "text-sm text-slate-400"}>
                    {c.dues > 0 ? formatRupees(c.dues) : t("customers.noUdhaar")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardBody className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar name={chosen.name} className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-slate-900">{chosen.name}</p>
              <p className="text-sm text-slate-500">{chosen.phone ? formatPhone(chosen.phone) : ""}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setChosen(null)}>
              {t("payment.change")}
            </Button>
          </div>

          {chosen.dues <= 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] font-medium text-emerald-800">
              <CircleCheck className="size-5" />
              {t("payment.noDues", { name: chosen.name })}
            </p>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-700">{t("payment.unpaidBills")}</p>
                <ul className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {unpaid.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[15px]">
                      <Link to={`/bills/${b.id}`} className="font-mono font-semibold text-brand-800 hover:underline">
                        {b.number}
                      </Link>
                      <span className="text-sm text-slate-500">{formatDate(b.date, i18n.language)}</span>
                      <span className="ml-auto font-semibold text-red-600 tabular-nums">{formatRupees(b.balance)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t("payment.amount")} htmlFor="pay-amount" className="w-48" error={amount !== null && !valid ? t("payment.amountProblem", { max: formatRupees(chosen.dues) }) : undefined}>
                  <Input id="pay-amount" inputMode="decimal" prefix="₹" value={amountText} onChange={(e) => setAmountText(e.target.value)} invalid={amount !== null && !valid} className="text-lg font-semibold" />
                </Field>
                <Button variant="ghost" size="sm" className="mb-1" onClick={() => setAmountText(paiseToInput(chosen.dues))}>
                  {t("payment.payFull")}
                </Button>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">{t("payment.mode")}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {MODES.map((m) => {
                    const Icon = MODE_ICONS[m];
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                          "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-sm font-semibold",
                          mode === m ? "border-brand-700 bg-brand-50 text-brand-900" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300",
                        )}
                      >
                        <Icon className="size-5" />
                        {t(`modes.${m}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              {mode !== "cash" ? (
                <Field label={t("payment.reference")} htmlFor="pay-ref" optional={t("common.optional")}>
                  <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      {chosen.dues > 0 ? (
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-slate-600">{t("payment.duesNow")}</span>
              <span className="text-lg font-semibold text-red-600 tabular-nums">{formatRupees(chosen.dues)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-[15px] text-slate-600">{t("payment.amount")}</span>
              <span className="text-lg font-semibold text-emerald-700 tabular-nums">{amount ? formatRupees(amount) : "—"}</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
              <span className="text-base font-bold text-slate-900">{t("payment.confirmLeft")}</span>
              <span className="text-2xl font-bold text-slate-900 tabular-nums">{valid ? formatRupees(chosen.dues - amount!) : "—"}</span>
            </div>
          </Card>
          <Button size="xl" icon={IndianRupee} disabled={!valid} loading={saving} onClick={() => void save()}>
            {t("payment.save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Bajaj Finance loans waiting for Bajaj to pay the shop. */
function FromBajaj() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const pending = useAsync(listPendingFinance);
  const [open, setOpen] = useState<PendingFinance | null>(null);
  const [amountText, setAmountText] = useState("");
  const [dateText, setDateText] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const amount = parseRupees(amountText);

  const save = async () => {
    if (!open || !amount || amount <= 0) return;
    setSaving(true);
    try {
      await settleFinance(open.id, amount, dateText);
      toast(t("payment.bajajSaved", { number: open.billNumber }));
      setOpen(null);
      pending.reload();
    } catch (err) {
      toast(errorText(t, err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {pending.loading ? (
        <div className="space-y-3 p-5">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : (pending.data ?? []).length === 0 ? (
        <p className="flex items-center gap-2 px-6 py-8 text-[15px] text-slate-600">
          <CircleCheck className="size-5 text-emerald-600" />
          {t("payment.bajajNone")}
        </p>
      ) : (
        <>
          <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600 sm:px-6">{t("payment.bajajHint")}</p>
          <ul className="divide-y divide-slate-100">
            {(pending.data ?? []).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6">
                <span className="min-w-0 flex-1">
                  <Link to={`/bills/${f.billId}`} className="font-mono text-[15px] font-semibold text-brand-800 hover:underline">
                    {f.billNumber}
                  </Link>
                  <span className="block text-sm text-slate-500">
                    {f.customerName} · {formatDate(f.billDate, i18n.language)}
                    {f.referenceNo ? ` · ${f.referenceNo}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-xs text-slate-500">{t("payment.loan")}</span>
                  <span className="font-bold tabular-nums">{formatRupees(f.loanAmount)}</span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CircleCheck}
                  onClick={() => {
                    setOpen(f);
                    setAmountText(paiseToInput(f.loanAmount));
                    setDateText(todayISO());
                  }}
                >
                  {t("payment.markReceived")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Dialog
        open={open !== null}
        onClose={() => setOpen(null)}
        size="sm"
        title={open ? t("payment.bajajTitle", { number: open.billNumber }) : ""}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setOpen(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="lg" loading={saving} disabled={!amount || amount <= 0} onClick={() => void save()}>
              {t("payment.markReceived")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <Field label={t("payment.received")} htmlFor="bajaj-received" hint={t("payment.receivedHint")}>
            <Input id="bajaj-received" inputMode="decimal" prefix="₹" value={amountText} onChange={(e) => setAmountText(e.target.value)} data-autofocus />
          </Field>
          <Field label={t("payment.receivedOn")} htmlFor="bajaj-date" hint={/^\d{4}-\d{2}-\d{2}$/.test(dateText) ? formatDate(dateText, i18n.language) : undefined}>
            <Input id="bajaj-date" type="date" max={todayISO()} value={dateText} onChange={(e) => setDateText(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Card>
  );
}

export function PaymentReceivedPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const tab = params.get("tab") === "bajaj" ? "bajaj" : "customer";
  const initialCustomerId = (location.state as { customerId?: string } | null)?.customerId;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900">
        <IndianRupee className="size-7 text-brand-800" />
        {t("payment.title")}
      </h1>
      <Segmented<"customer" | "bajaj">
        label={t("payment.title")}
        value={tab}
        onChange={(v) => setParams(v === "bajaj" ? { tab: "bajaj" } : {}, { replace: true })}
        options={[
          { value: "customer", label: t("payment.fromCustomer") },
          {
            value: "bajaj",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Landmark className="size-4" />
                {t("payment.fromBajaj")}
              </span>
            ),
          },
        ]}
        className="self-start"
      />
      {tab === "bajaj" ? <FromBajaj /> : <FromCustomer initialCustomerId={initialCustomerId} />}
    </div>
  );
}
