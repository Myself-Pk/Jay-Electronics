import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { COMPOSITION_DECLARATION } from "@/data/defaults";
import type { BillDetails, PaymentMode } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { splitCgstSgst, taxSummary } from "@/lib/billMath";
import { stateLabel } from "@/lib/gstStates";
import { amountInWords, formatPercent, formatRupees } from "@/lib/money";
import { upiPayLink } from "@/lib/share";

interface Props {
  bill: BillDetails;
  /** Called once the bill (including its UPI QR code) is ready to print. */
  onReady?: () => void;
  className?: string;
}

/**
 * The printed A4 bill. Always in English, because it's an official document.
 * Composition scheme: titled "BILL OF SUPPLY" with the required declaration at the top, no GST.
 */
export function BillSheet({ bill, onReady, className }: Props) {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT("en");
  const money = (p: number) => formatRupees(p, { paise: "always" });
  const [qr, setQr] = useState<string | null>(null);
  const readyCalled = useRef(false);

  const upiAmount = bill.status === "saved" && bill.balance > 0 && bill.shop.upiId ? bill.balance : 0;

  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!readyCalled.current) {
        readyCalled.current = true;
        onReady?.();
      }
    };
    if (!upiAmount) {
      setQr(null);
      done();
      return;
    }
    const link = upiPayLink({ upiId: bill.shop.upiId, payeeName: bill.shop.shopName, amount: upiAmount, note: `Bill ${bill.number}` });
    QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(
      (url) => {
        if (!cancelled) {
          setQr(url);
          done();
        }
      },
      () => done(),
    );
    return () => {
      cancelled = true;
    };
  }, [upiAmount, bill.shop.upiId, bill.shop.shopName, bill.number, onReady]);

  // "UPI ₹10,000 · Cash ₹3,710"
  const paidByMode = new Map<PaymentMode, number>();
  for (const p of bill.payments) paidByMode.set(p.mode, (paidByMode.get(p.mode) ?? 0) + p.amount);
  const paidText = [...paidByMode].map(([mode, amount]) => `${t(`modes.${mode}`)} ${money(amount)}`).join("  ·  ");

  // Tax Invoice (Regular GST): prices include GST; the summary splits it by rate into CGST + SGST,
  // or IGST when the place of supply is another state.
  const isTaxInvoice = bill.title === "tax_invoice";
  const interState = isTaxInvoice && bill.placeOfSupply !== bill.shop.stateCode;
  const taxRows = isTaxInvoice
    ? taxSummary(
        bill.items.map((i) => ({ amount: i.amount, gstRate: i.gstRate ?? 0, gst: i.gstAmount ?? 0 })),
        bill.extraCharges,
      )
    : [];
  const taxTotal = taxRows.reduce((s, r) => s + r.gst, 0);

  return (
    <article
      className={cn(
        "relative mx-auto w-full max-w-[210mm] bg-white p-[10mm] text-[13px] leading-snug text-slate-900 shadow-lg",
        "print:max-w-none print:p-0 print:shadow-none",
        className,
      )}
    >
      {bill.status === "cancelled" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-lg border-[6px] border-red-500 px-8 py-2 text-7xl font-black tracking-widest text-red-500 opacity-30">
            {t("billSheet.cancelled")}
          </span>
        </div>
      ) : null}

      {bill.title === "bill_of_supply" ? (
        <p className="text-center text-[11px] font-medium text-slate-700">{COMPOSITION_DECLARATION}</p>
      ) : null}

      <header className="mt-2 flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight uppercase">{bill.shop.shopName}</h1>
          <p className="whitespace-pre-line text-slate-700">{bill.shop.address}</p>
          {bill.shop.phone ? (
            <p className="text-slate-700">
              {t("billSheet.phone")}: {bill.shop.phone}
            </p>
          ) : null}
          {/* A bill made without GST on purpose shows no GSTIN. */}
          {bill.shop.gstin && bill.title !== "bill" ? (
            <p className="font-semibold">
              {t("billSheet.gstin")}: {bill.shop.gstin}
              {isTaxInvoice ? <span className="font-normal text-slate-700">  ·  {t("billSheet.state")}: {stateLabel(bill.shop.stateCode)}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="rounded bg-slate-900 px-3 py-1 text-[15px] font-bold tracking-wider text-white print:bg-slate-900">
            {bill.title === "tax_invoice" ? t("billSheet.taxInvoice") : bill.title === "bill" ? t("billSheet.plainBill") : t("billSheet.billOfSupply")}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5">
            <dt className="text-slate-500">{t("billSheet.billNo")}</dt>
            <dd className="font-mono font-bold">{bill.number}</dd>
            <dt className="text-slate-500">{t("billSheet.date")}</dt>
            <dd className="font-semibold">{formatDate(bill.date, "en")}</dd>
          </dl>
        </div>
      </header>

      <section className="flex items-start justify-between gap-6 py-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t("billSheet.billTo")}</p>
          <p className="text-[15px] font-bold">{bill.customerName || t("newBill.walkIn")}</p>
          {bill.customerPhone ? <p>{bill.customerPhone}</p> : null}
          {bill.customerAddress ? <p className="text-slate-700">{bill.customerAddress}</p> : null}
          {isTaxInvoice && bill.customerGstin ? (
            <p className="font-semibold">
              {t("billSheet.gstin")}: {bill.customerGstin}
            </p>
          ) : null}
          {isTaxInvoice ? (
            <p className="text-[12px] text-slate-700">
              {t("billSheet.placeOfSupply")}: {stateLabel(bill.placeOfSupply)}
            </p>
          ) : null}
        </div>
        {bill.billedBy ? <p className="text-[11px] text-slate-500">{t("billSheet.billedBy", { name: bill.billedBy })}</p> : null}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-900 text-left text-[11px] tracking-wider text-slate-600 uppercase">
            <th className="w-8 py-1.5 pr-2 font-semibold">{t("billSheet.no")}</th>
            <th className="py-1.5 pr-2 font-semibold">{t("billSheet.item")}</th>
            <th className="w-16 py-1.5 pr-2 font-semibold">{t("billSheet.hsn")}</th>
            <th className="w-12 py-1.5 pr-2 text-right font-semibold">{t("billSheet.qty")}</th>
            <th className="w-24 py-1.5 pr-2 text-right font-semibold">{t("billSheet.rate")}</th>
            {isTaxInvoice ? (
              <>
                <th className="w-14 py-1.5 pr-2 text-right font-semibold">{t("billSheet.gstRate")}</th>
                <th className="w-24 py-1.5 pr-2 text-right font-semibold">{t("billSheet.taxable")}</th>
              </>
            ) : null}
            <th className="w-28 py-1.5 text-right font-semibold">{t("billSheet.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item) => (
            <tr key={item.lineNo} className="border-b border-slate-200 align-top">
              <td className="py-2 pr-2 text-slate-500">{item.lineNo}</td>
              <td className="py-2 pr-2">
                <p className="font-semibold">{item.description}</p>
                {item.serialNo ? (
                  <p className="text-[12px] text-slate-700">
                    {t("billSheet.serial")}: <span className="font-mono font-semibold">{item.serialNo}</span>
                  </p>
                ) : null}
                {item.warrantyText ? <p className="text-[12px] text-slate-600">{item.warrantyText}</p> : null}
              </td>
              <td className="py-2 pr-2 text-slate-600">{item.hsn}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{item.qty}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{money(item.rate)}</td>
              {isTaxInvoice ? (
                <>
                  {/* Tax-free lines (e.g. Delivery & installation) show no GST at all. */}
                  <td className="py-2 pr-2 text-right tabular-nums">{(item.gstRate ?? 0) > 0 ? formatPercent(item.gstRate) : ""}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{(item.gstRate ?? 0) > 0 ? money(item.amount - (item.gstAmount ?? 0)) : ""}</td>
                </>
              ) : null}
              <td className="py-2 text-right font-semibold tabular-nums">{money(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isTaxInvoice && taxRows.length > 0 ? (
        <table className="mt-3 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-slate-400 text-left text-[10px] tracking-wider text-slate-600 uppercase">
              <th className="py-1 pr-2 font-semibold">{t("billSheet.gstSummary")}</th>
              <th className="py-1 pr-2 text-right font-semibold">{t("billSheet.taxable")}</th>
              {interState ? (
                <th className="py-1 pr-2 text-right font-semibold">{t("billSheet.igst")}</th>
              ) : (
                <>
                  <th className="py-1 pr-2 text-right font-semibold">{t("billSheet.cgst")}</th>
                  <th className="py-1 pr-2 text-right font-semibold">{t("billSheet.sgst")}</th>
                </>
              )}
              <th className="py-1 text-right font-semibold">{t("billSheet.totalTax")}</th>
            </tr>
          </thead>
          <tbody>
            {taxRows.map((row) => {
              const { cgst, sgst } = splitCgstSgst(row.gst);
              return (
                <tr key={row.rate} className="border-b border-slate-200">
                  <td className="py-1 pr-2">{t("billSheet.gstAt", { rate: formatPercent(row.rate) })}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{money(row.taxable)}</td>
                  {interState ? (
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatPercent(row.rate)} · {money(row.gst)}
                    </td>
                  ) : (
                    <>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatPercent(Math.round(row.rate / 2))} · {money(cgst)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatPercent(Math.round(row.rate / 2))} · {money(sgst)}
                      </td>
                    </>
                  )}
                  <td className="py-1 text-right font-semibold tabular-nums">{money(row.gst)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className="py-1 pr-2">{t("billSheet.total")}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{money(taxRows.reduce((s, r) => s + r.taxable, 0))}</td>
              {interState ? (
                <td className="py-1 pr-2 text-right tabular-nums">{money(taxTotal)}</td>
              ) : (
                <>
                  <td className="py-1 pr-2 text-right tabular-nums">{money(taxRows.reduce((s, r) => s + splitCgstSgst(r.gst).cgst, 0))}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{money(taxRows.reduce((s, r) => s + splitCgstSgst(r.gst).sgst, 0))}</td>
                </>
              )}
              <td className="py-1 text-right tabular-nums">{money(taxTotal)}</td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      <section className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p>
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t("billSheet.inWords")}</span>
            <br />
            <span className="font-semibold">{amountInWords(bill.total)}</span>
          </p>
          {paidText ? (
            <p>
              <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t("billSheet.paidBy")}</span>
              <br />
              {paidText}
              {bill.finance?.referenceNo ? (
                <span className="text-slate-600">  ({t("billSheet.bajajRef", { ref: bill.finance.referenceNo })})</span>
              ) : null}
            </p>
          ) : null}
          {qr ? (
            <div className="flex items-center gap-3 pt-1">
              <img src={qr} alt="" className="size-28 rounded border border-slate-300" />
              <p className="max-w-40 text-[12px] font-semibold">
                {t("billSheet.payByUpi", { amount: money(upiAmount) })}
                <br />
                <span className="font-mono font-normal text-slate-600">{bill.shop.upiId}</span>
              </p>
            </div>
          ) : null}
        </div>

        <dl className="w-72 shrink-0 space-y-1">
          <div className="flex justify-between">
            <dt className="text-slate-600">{t("billSheet.subtotal")}</dt>
            <dd className="tabular-nums">{money(bill.subtotal)}</dd>
          </div>
          {bill.scrap.map((s, i) => (
            <div key={i} className="flex justify-between gap-2">
              <dt className="text-slate-600">
                {t("billSheet.lessOldBattery")}
                <span className="block text-[11px]">
                  {s.weightKg && s.ratePerKg !== null
                    ? t("billSheet.oldBatteryWeight", { type: s.batteryType, weight: s.weightKg, rate: formatRupees(s.ratePerKg) })
                    : s.batteryType}
                </span>
              </dt>
              <dd className="tabular-nums">− {money(s.value)}</dd>
            </div>
          ))}
          {bill.extraCharges > 0 ? (
            <div className="flex justify-between">
              <dt className="text-slate-600">{t("billSheet.charges")}</dt>
              <dd className="tabular-nums">{money(bill.extraCharges)}</dd>
            </div>
          ) : null}
          {bill.roundOff !== 0 ? (
            <div className="flex justify-between">
              <dt className="text-slate-600">{t("billSheet.roundOff")}</dt>
              <dd className="tabular-nums">{money(bill.roundOff)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-y-2 border-slate-900 py-1.5 text-[17px] font-extrabold">
            <dt>{t("billSheet.total")}</dt>
            <dd className="tabular-nums">{money(bill.total)}</dd>
          </div>
          {isTaxInvoice ? (
            <div className="flex justify-between text-[12px] text-slate-600">
              <dt>{t("billSheet.includesGst")}</dt>
              <dd className="tabular-nums">{money(taxTotal)}</dd>
            </div>
          ) : null}
          {bill.balance > 0 ? (
            <div className="flex justify-between text-[15px] font-bold">
              <dt>{t("billSheet.balanceDue")}</dt>
              <dd className="tabular-nums">{money(bill.balance)}</dd>
            </div>
          ) : null}
          {isTaxInvoice ? <p className="pt-1 text-right text-[11px] text-slate-500">{t("billSheet.reverseCharge")}</p> : null}
        </dl>
      </section>

      <footer className="mt-8 flex items-end justify-between gap-8">
        <div className="max-w-[60%]">
          <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t("billSheet.terms")}</p>
          <p className="text-[11px] whitespace-pre-line text-slate-700">{bill.shop.billTerms}</p>
        </div>
        <div className="text-center">
          <p className="font-semibold">{t("billSheet.forShop", { shop: bill.shop.shopName })}</p>
          <div className="h-14" />
          <p className="border-t border-slate-400 px-6 pt-1 text-[12px] text-slate-600">{t("billSheet.signatory")}</p>
        </div>
      </footer>
      <p className="mt-6 text-center text-[12px] text-slate-500">{t("billSheet.thanks")}</p>
    </article>
  );
}
