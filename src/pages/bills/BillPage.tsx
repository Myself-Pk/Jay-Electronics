import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, Ban, BadgeCheck, CircleCheck, MessageCircle, Plus, Printer, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { cancelBill, getBill, markWarrantyRegistered } from "@/data/bills";
import { asBillError } from "@/data/errors";
import { canSeeOwnerData, type BillDetails } from "@/data/types";
import { formatDate } from "@/lib/dates";
import { formatRupees } from "@/lib/money";
import { billPdfName, billSheetToPdf, shareBillPdf } from "@/lib/billPdf";
import { whatsAppShareUrl, whatsAppUrl } from "@/lib/share";
import { useAsync } from "@/lib/useAsync";
import { BillSheet } from "./BillSheet";
import { formatPhone } from "./CustomerSection";

export function billStatusBadge(bill: Pick<BillDetails, "status" | "balance">, t: (key: string, o?: Record<string, unknown>) => string) {
  if (bill.status === "cancelled") return <Badge tone="red">{t("bills.cancelled")}</Badge>;
  if (bill.balance > 0) return <Badge tone="amber">{t("bills.udhaar", { amount: formatRupees(bill.balance) })}</Badge>;
  return (
    <Badge tone="green">
      <CircleCheck className="size-3.5" />
      {t("bills.paid")}
    </Badge>
  );
}

type NavState = { justSaved?: boolean; then?: "print" | "whatsapp" } | null;

export function BillPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as NavState;
  const { person } = useSession();
  const isOwner = canSeeOwnerData(person?.role);
  const billQ = useAsync(() => getBill(id), [id]);
  const bill = billQ.data;

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [sheetReady, setSheetReady] = useState(false);
  const autoDone = useRef(false);
  const onSheetReady = useCallback(() => setSheetReady(true), []);

  // The PDF of this bill, made in the background from a hidden A4 copy of the sheet as soon as the
  // bill opens, so tapping "Send PDF on WhatsApp" can open the share menu straight away.
  const pdfSheetRef = useRef<HTMLDivElement>(null);
  const [pdfSheetReady, setPdfSheetReady] = useState(false);
  const onPdfSheetReady = useCallback(() => setPdfSheetReady(true), []);
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [sending, setSending] = useState(false);

  /** The WhatsApp message that goes with the PDF. */
  const shareText = useCallback(
    (b: BillDetails): string => {
      const lines = [
        b.customerName ? t("bills.share.greeting", { name: b.customerName }) : t("bills.share.greeting", { name: "" }).replace(" ,", ","),
        t("bills.share.thanks", { shop: b.shop.shopName }),
        "",
        t("bills.share.bill", { number: b.number, date: formatDate(b.date, i18n.language) }),
        t("bills.share.total", { amount: formatRupees(b.total) }),
        ...(b.balance > 0 ? [t("bills.share.balance", { amount: formatRupees(b.balance) })] : []),
        "",
        t("bills.share.attached"),
        t("bills.share.keep"),
      ];
      return lines.join("\n");
    },
    [t, i18n.language],
  );

  useEffect(() => {
    if (!bill || !pdfSheetReady || !pdfSheetRef.current) return;
    const sheet = pdfSheetRef.current.firstElementChild as HTMLElement | null;
    if (!sheet) return;
    let cancelled = false;
    setPdf(null);
    setPdfFailed(false);
    // Let fonts and layout settle, then take the picture of the hidden copy.
    const timer = window.setTimeout(() => {
      billSheetToPdf(sheet, billPdfName(bill.number)).then(
        (file) => {
          if (!cancelled) setPdf(file);
        },
        (err: unknown) => {
          console.error(err);
          if (!cancelled) setPdfFailed(true);
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bill, pdfSheetReady]);

  /** Straight from the tap: the share menu with the PDF, or download it and open the customer's chat. */
  const sendPdf = async () => {
    if (!bill || !pdf) return;
    const text = shareText(bill);
    const chat = /^\d{10}$/.test(bill.customerPhone) ? whatsAppUrl(bill.customerPhone, text) : whatsAppShareUrl(text);
    setSending(true);
    try {
      const result = await shareBillPdf(pdf, text, chat);
      if (result === "downloaded") toast(t("bills.pdfDownloaded"), "info");
    } finally {
      setSending(false);
    }
  };

  // Right after saving: print or open WhatsApp once, then forget, so a refresh doesn't repeat it.
  useEffect(() => {
    if (!bill || !sheetReady || autoDone.current || !navState?.then) return;
    autoDone.current = true;
    const then = navState.then;
    navigate(location.pathname, { replace: true, state: { justSaved: true } });
    if (then === "print") window.setTimeout(() => window.print(), 150);
    // Sharing a file needs a tap, so after "Save & WhatsApp" the green button is the next step.
    else toast(t("bills.tapWhatsApp"), "info");
  }, [bill, sheetReady, navState, navigate, location.pathname, toast, t]);

  if (billQ.loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-72 animate-pulse rounded-xl bg-slate-200" />
        <div className="mx-auto h-[600px] max-w-[210mm] animate-pulse rounded bg-white" />
      </div>
    );
  }
  if (!bill) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-[15px] text-slate-700">{t("bills.notFound")}</p>
        <LinkButton to="/bills" variant="secondary" className="mt-4" icon={ArrowLeft}>
          {t("bills.back")}
        </LinkButton>
      </Card>
    );
  }

  const pendingRegistrations = bill.status === "saved" ? bill.items.filter((i) => i.needsRegistration && i.unitId) : [];

  const doCancel = async () => {
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setCancelling(true);
    try {
      await cancelBill(bill.id, reason.trim(), person?.role ?? "staff");
      toast(t("bills.cancelledToast", { number: bill.number }));
      setCancelOpen(false);
      billQ.reload();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details as Record<string, string>) : t("common.somethingWrong"), "error");
    } finally {
      setCancelling(false);
    }
  };

  const markRegistered = async (unitId: string) => {
    setMarking(unitId);
    try {
      await markWarrantyRegistered(unitId);
      toast(t("bills.registration.marked"));
      billQ.reload();
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details as Record<string, string>) : t("common.somethingWrong"), "error");
    } finally {
      setMarking(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 print:hidden">
        <LinkButton to="/bills" variant="ghost" size="sm" icon={ArrowLeft} className="self-start">
          {t("bills.back")}
        </LinkButton>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{bill.number}</h1>
          {billStatusBadge(bill, t)}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button icon={Printer} onClick={() => window.print()}>
              {t("bills.print")}
            </Button>
            <Button
              variant="success"
              icon={MessageCircle}
              loading={(!pdf && !pdfFailed) || sending}
              disabled={pdfFailed}
              title={pdfFailed ? t("bills.pdfFailed") : undefined}
              onClick={() => void sendPdf()}
            >
              {pdf || pdfFailed ? t("bills.whatsapp") : t("bills.pdfPreparing")}
            </Button>
            <LinkButton to="/bills/new" variant="secondary" icon={Plus}>
              {t("bills.newBill")}
            </LinkButton>
            {isOwner && bill.status === "saved" ? (
              <Button
                variant="ghost"
                icon={Ban}
                className="text-red-600 hover:bg-red-50"
                onClick={() => {
                  setReason("");
                  setReasonError(false);
                  setCancelOpen(true);
                }}
              >
                {t("bills.cancel")}
              </Button>
            ) : null}
          </div>
        </div>

        {pdfFailed ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-800">{t("bills.pdfFailed")}</p>
        ) : /^\d{10}$/.test(bill.customerPhone) ? (
          <p className="-mt-2 text-sm text-slate-500 sm:text-right">
            {t("bills.pdfHint", { name: bill.customerName || formatPhone(bill.customerPhone), phone: formatPhone(bill.customerPhone) })}
          </p>
        ) : null}

        {navState?.justSaved && bill.status === "saved" ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] font-medium text-emerald-800">
            <CircleCheck className="size-5" />
            {t("bills.savedBanner")}
          </p>
        ) : null}
        {bill.status === "cancelled" ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-[15px] font-medium text-red-700">
            {t("bills.cancelledBanner", { reason: bill.cancelReason ?? "" })}
          </p>
        ) : null}

        {pendingRegistrations.length > 0 ? (
          <Card>
            <CardHeader icon={ShieldCheck} title={t("bills.registration.title")} description={t("bills.registration.text")} />
            <ul className="divide-y divide-slate-100">
              {pendingRegistrations.map((item) => (
                <li key={item.unitId} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-slate-900">{item.description}</p>
                    <p className="font-mono text-sm text-slate-600">{item.serialNo}</p>
                  </div>
                  {item.registeredAt ? (
                    <Badge tone="green">
                      <BadgeCheck className="size-3.5" />
                      {t("bills.registration.done")}
                    </Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={BadgeCheck}
                      loading={marking === item.unitId}
                      onClick={() => void markRegistered(item.unitId!)}
                    >
                      {t("bills.registration.mark")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="overflow-x-auto pb-6 print:overflow-visible print:pb-0">
        <BillSheet bill={bill} onReady={onSheetReady} className="min-w-[640px] print:min-w-0" />
      </div>

      {/* Hidden A4-wide copy of the bill used to make the PDF (same size on a phone or a PC). */}
      <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px] w-[210mm] print:hidden">
        <div ref={pdfSheetRef}>
          <BillSheet bill={bill} onReady={onPdfSheetReady} className="max-w-none shadow-none" />
        </div>
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t("bills.cancelTitle", { number: bill.number })}
        description={t("bills.cancelMessage")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setCancelOpen(false)}>
              {t("bills.keep")}
            </Button>
            <Button variant="danger" size="lg" loading={cancelling} onClick={() => void doCancel()}>
              {t("bills.cancelConfirm")}
            </Button>
          </>
        }
      >
        <div className="pb-2">
          <Field
            label={t("bills.cancelReason")}
            htmlFor="cancel-reason"
            error={reasonError ? t("billErrors.reason_required") : undefined}
          >
            <Textarea
              id="cancel-reason"
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(false);
              }}
              invalid={reasonError}
              data-autofocus
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
