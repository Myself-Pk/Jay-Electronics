import { Link, useParams } from "react-router";
import { ArrowLeft, BadgeCheck, Battery, IndianRupee, MessageCircle, Receipt, ShieldAlert, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/auth/LoginScreen";
import { Badge } from "@/components/ui/Badge";
import { LinkButton, buttonClasses } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { getCustomerDues, listCustomerBills, listCustomerPayments, listOwnedUnits } from "@/data/payments";
import { getSettings } from "@/data/settings";
import { formatDate, todayISO } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { whatsAppUrl } from "@/lib/share";
import { useAsync } from "@/lib/useAsync";
import { warrantyStatus } from "@/lib/warranty";
import { billStatusBadge } from "../bills/BillPage";
import { formatPhone } from "../bills/CustomerSection";
import { MODE_ICONS } from "../bills/PaymentSection";

export function CustomerPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const customer = useAsync(() => getCustomerDues(id), [id]);
  const c = customer.data;
  const details = useAsync(
    () =>
      c
        ? Promise.all([listCustomerBills(c), listCustomerPayments(c), listOwnedUnits(c.id), getSettings()])
        : Promise.resolve(null),
    [c?.id],
  );
  const date = (iso: string) => formatDate(iso, i18n.language);

  if (customer.loading) return <div className="h-64 animate-pulse rounded-2xl bg-white" />;
  if (!c) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-[15px] text-slate-700">{t("customers.notFound")}</p>
        <LinkButton to="/customers" variant="secondary" className="mt-4" icon={ArrowLeft}>
          {t("customers.back")}
        </LinkButton>
      </Card>
    );
  }

  const [bills, payments, units, settings] = details.data ?? [[], [], [], null];
  const unpaid = bills.filter((b) => b.status === "saved" && b.balance > 0);
  const reminder =
    c.dues > 0 && c.phone && settings
      ? whatsAppUrl(
          c.phone,
          t("customers.reminder", {
            name: c.name,
            shop: settings.shopName,
            amount: formatRupees(c.dues),
            bills: unpaid.map((b) => b.number).join(", "),
            upi: settings.upiId ? t("customers.reminderUpi", { upi: settings.upiId }) : "",
          }),
        )
      : null;
  const today = todayISO();

  return (
    <div className="flex flex-col gap-5">
      <LinkButton to="/customers" variant="ghost" size="sm" icon={ArrowLeft} className="self-start">
        {t("customers.back")}
      </LinkButton>

      <Card className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <Avatar name={c.name} className="size-14 text-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {c.name}
            {c.type === "dealer" ? <Badge tone="brand" className="ml-2 align-middle">{t("newBill.dealer")}</Badge> : null}
          </h1>
          <p className="text-[15px] text-slate-500">{[c.phone ? formatPhone(c.phone) : null, c.area || null].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-500 uppercase">{t("customers.udhaar")}</p>
          <p className={c.dues > 0 ? "text-3xl font-bold text-red-600 tabular-nums" : "text-xl font-semibold text-emerald-700"}>
            {c.dues > 0 ? formatRupees(c.dues) : t("customers.noUdhaar")}
          </p>
        </div>
        {c.dues > 0 ? (
          <div className="flex w-full flex-wrap gap-2">
            <LinkButton to="/payments/new" state={{ customerId: c.id }} icon={IndianRupee}>
              {t("customers.receive")}
            </LinkButton>
            {reminder ? (
              <a href={reminder} target="_blank" rel="noopener noreferrer" className={buttonClasses("success", "md")}>
                <MessageCircle className="size-5" />
                {t("customers.remind")}
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Receipt} title={t("customers.billsTitle")} />
          {bills.length === 0 ? (
            <p className="px-6 py-5 text-[15px] text-slate-500">{t("customers.noBills")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bills.map((b) => (
                <li key={b.id}>
                  <Link to={`/bills/${b.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-50 sm:px-6">
                    <span className="font-mono text-[15px] font-semibold text-slate-900">{b.number}</span>
                    <span className="text-sm text-slate-500">{date(b.date)}</span>
                    <span className="ml-auto font-semibold tabular-nums">{formatRupees(b.total)}</span>
                    {billStatusBadge(b, t)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={Wallet} title={t("customers.paymentsTitle")} />
          {payments.length === 0 ? (
            <p className="px-6 py-5 text-[15px] text-slate-500">{t("customers.noPayments")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p, i) => {
                const Icon = MODE_ICONS[p.mode];
                return (
                  <li key={i} className={p.status === "cancelled" ? "flex items-center gap-3 px-5 py-3 text-slate-400 line-through sm:px-6" : "flex items-center gap-3 px-5 py-3 sm:px-6"}>
                    <Icon className="size-5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-slate-800">{t(`modes.${p.mode}`)}</span>
                      <span className="block text-sm text-slate-500">
                        {date(p.date)}
                        {p.billNumber ? ` · ${t("customers.forBill", { bill: p.billNumber })}` : ""}
                      </span>
                    </span>
                    <span className="font-semibold text-emerald-700 tabular-nums">{formatRupees(p.amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader icon={Battery} title={t("customers.ownedTitle")} />
        {units.length === 0 ? (
          <p className="px-6 py-5 text-[15px] text-slate-500">{t("customers.noOwned")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {units.map((u) => {
              const w = warrantyStatus(u.warrantyStart, u.freeMonths, u.prorataMonths, today);
              return (
                <li key={u.unitId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 sm:px-6">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900">{u.product}</span>
                    <span className="block font-mono text-sm text-slate-600">
                      {u.serial}
                      {u.soldOn ? <span className="font-sans text-slate-500"> · {t("customers.sold", { date: date(u.soldOn) })}</span> : null}
                    </span>
                  </span>
                  {w.state === "free" ? (
                    <Badge tone="green">{t("customers.warranty.free", { date: date(w.until) })}</Badge>
                  ) : w.state === "prorata" ? (
                    <Badge tone="amber">{t("customers.warranty.prorata", { date: date(w.until) })}</Badge>
                  ) : w.state === "expired" ? (
                    <Badge>{t("customers.warranty.expired", { date: date(w.endedOn) })}</Badge>
                  ) : (
                    <Badge>{t("customers.warranty.none")}</Badge>
                  )}
                  {u.needsRegistration ? (
                    u.registeredAt ? (
                      <Badge tone="green">
                        <BadgeCheck className="size-3.5" />
                        {t("customers.registered")}
                      </Badge>
                    ) : (
                      <Badge tone="red">
                        <ShieldAlert className="size-3.5" />
                        {t("customers.notRegistered")}
                      </Badge>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
