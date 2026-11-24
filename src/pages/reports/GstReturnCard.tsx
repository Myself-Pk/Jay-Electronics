import type { ReactNode } from "react";
import { Download, Landmark, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { getGstBills } from "@/data/reports";
import { formatDate } from "@/lib/dates";
import { gstr1Csv, gstReturn, type HsnRow, type TaxSplit } from "@/lib/gstReturn";
import { stateLabel } from "@/lib/gstStates";
import { formatPercent, formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { JHARKHAND_STATE_CODE } from "@/lib/validation";

const money = (p: number) => formatRupees(p, { paise: "always" });

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A small table that scrolls sideways on a phone. */
function Table({ head, rows, empty }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0 && empty) return <p className="py-2 text-[15px] text-slate-500">{empty}</p>;
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
            {head.map((h, i) => (
              <th key={i} className={i === 0 ? "py-2 pr-3 font-semibold" : "py-2 pr-3 text-right font-semibold last:pr-0"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "py-2 pr-3 text-slate-800" : "py-2 pr-3 text-right tabular-nums last:pr-0"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const taxCells = (r: TaxSplit) => [money(r.taxable), money(r.igst), money(r.cgst), money(r.sgst)];

/**
 * Regular GST: what goes into GSTR-1 and GSTR-3B for the dates chosen on the Reports screen,
 * with Excel downloads in the GST offline tool's columns.
 */
export function GstReturnCard({ from, to }: { from: string; to: string }) {
  const { t, i18n } = useTranslation();
  const bills = useAsync(() => getGstBills(from, to), [from, to]);
  const lang = i18n.language;
  const r = bills.data ? gstReturn(bills.data, JHARKHAND_STATE_CODE) : null;
  const totalGst = r ? r.outward.igst + r.outward.cgst + r.outward.sgst : 0;
  const taxHead = [t("gstReturn.taxable"), t("gstReturn.igst"), t("gstReturn.cgst"), t("gstReturn.sgst")];
  const hsnRows = (rows: HsnRow[]) =>
    rows.map((h) => [
      <span key="h">
        <span className="font-mono font-semibold">{h.hsn}</span>
        <span className="block text-xs text-slate-500">{h.description}</span>
      </span>,
      `${h.qty} ${h.uqc}`,
      formatPercent(h.rate),
      ...taxCells(h),
    ]);

  const downloadAll = (key: "b2b" | "b2cs" | "hsnB2b" | "hsnB2c") => {
    if (!r) return;
    const csv = gstr1Csv(r, (code) => `${code}-${stateLabel(code).replace(/ \(\d+\)$/, "")}`);
    download(`GSTR1_${key}_${from}_to_${to}.csv`, csv[key]);
  };

  return (
    <Card>
      <CardHeader
        icon={Landmark}
        title={t("gstReturn.title")}
        description={t("gstReturn.period", { from: formatDate(from, lang), to: formatDate(to, lang) })}
      />
      {!r ? (
        <div className="m-5 h-32 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="flex flex-col gap-6 px-5 py-5 sm:px-6">
          {/* Headline: GSTR-3B 3.1(a) */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              [t("gstReturn.taxable"), r.outward.taxable],
              [t("gstReturn.cgst"), r.outward.cgst],
              [t("gstReturn.sgst"), r.outward.sgst],
              [t("gstReturn.igst"), r.outward.igst],
              [t("gstReturn.totalGst"), totalGst],
            ].map(([label, value], i) => (
              <div key={i} className={i === 4 ? "rounded-xl bg-brand-50 px-3 py-2.5" : "rounded-xl bg-slate-50 px-3 py-2.5"}>
                <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
                <dd className="text-lg font-bold text-slate-900 tabular-nums">{money(value as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="-mt-3 text-sm text-slate-600">
            {t("gstReturn.counts", { invoices: r.counts.taxInvoices, without: r.counts.withoutGst, cancelled: r.counts.cancelled })}
          </p>
          {r.withoutGst.count > 0 ? (
            <p className="-mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" />
              {t("gstReturn.withoutGstNote", { count: r.withoutGst.count, tax: money(r.withoutGst.tax) })}
            </p>
          ) : null}
          {r.counts.composition > 0 ? (
            <p className="-mt-3 text-sm text-slate-500">{t("gstReturn.compositionNote", { count: r.counts.composition })}</p>
          ) : null}

          <section>
            <h3 className="text-[15px] font-bold text-slate-900">{t("gstReturn.gstr3b")}</h3>
            <Table
              head={[t("gstReturn.section"), ...taxHead]}
              rows={[
                [t("gstReturn.outward"), ...taxCells(r.outward)],
                ...r.interStateUnregistered.map((x) => [t("gstReturn.interState", { state: stateLabel(x.pos) }), money(x.taxable), money(x.igst), "—", "—"]),
                ...(r.exempt.total > 0 ? [[t("gstReturn.exempt3b"), money(r.exempt.total), "—", "—", "—"]] : []),
              ]}
            />
          </section>

          <section className="flex flex-col gap-4">
            <h3 className="text-[15px] font-bold text-slate-900">{t("gstReturn.gstr1")}</h3>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("gstReturn.b2b")}</p>
              <Table
                head={[t("gstReturn.customer"), t("gstReturn.bill"), t("gstReturn.rate"), ...taxHead]}
                rows={r.b2b.map((x) => [
                  <span key="c">
                    <span className="font-semibold">{x.name}</span>
                    <span className="block font-mono text-xs text-slate-500">{x.gstin}</span>
                  </span>,
                  <span key="b">
                    <span className="font-mono">{x.number}</span>
                    <span className="block text-xs text-slate-500">{formatDate(x.date, lang)}</span>
                  </span>,
                  formatPercent(x.rate),
                  ...taxCells(x),
                ])}
                empty={t("gstReturn.noB2b")}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("gstReturn.b2c")}</p>
              <Table
                head={[t("gstReturn.place"), t("gstReturn.rate"), ...taxHead]}
                rows={r.b2cs.map((x) => [stateLabel(x.pos), formatPercent(x.rate), ...taxCells(x)])}
                empty={t("gstReturn.nothing")}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{t("gstReturn.hsnB2c")}</p>
              <Table head={[t("gstReturn.hsn"), t("gstReturn.qty"), t("gstReturn.rate"), ...taxHead]} rows={hsnRows(r.hsnB2c)} empty={t("gstReturn.nothing")} />
            </div>
            {r.hsnB2b.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-slate-700">{t("gstReturn.hsnB2b")}</p>
                <Table head={[t("gstReturn.hsn"), t("gstReturn.qty"), t("gstReturn.rate"), ...taxHead]} rows={hsnRows(r.hsnB2b)} />
              </div>
            ) : null}
            {r.exempt.total > 0 ? (
              <p className="text-[15px] text-slate-700">
                <span className="font-semibold">{t("gstReturn.exempt1")}: </span>
                {t("gstReturn.exemptText", {
                  intra: money(r.exempt.intraUnregistered + r.exempt.intraRegistered),
                  inter: money(r.exempt.interUnregistered + r.exempt.interRegistered),
                })}
              </p>
            ) : null}
            <p className="text-[15px] text-slate-700">
              <span className="font-semibold">{t("gstReturn.documents")}: </span>
              {r.documents.total > 0
                ? t("gstReturn.documentsText", { first: r.documents.first, last: r.documents.last, total: r.documents.total, cancelled: r.documents.cancelled })
                : t("gstReturn.nothing")}
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={Download} disabled={r.b2b.length === 0} onClick={() => downloadAll("b2b")}>
              {t("gstReturn.downloadB2b")}
            </Button>
            <Button variant="secondary" size="sm" icon={Download} disabled={r.b2cs.length === 0} onClick={() => downloadAll("b2cs")}>
              {t("gstReturn.downloadB2c")}
            </Button>
            <Button variant="secondary" size="sm" icon={Download} disabled={r.hsnB2c.length === 0} onClick={() => downloadAll("hsnB2c")}>
              {t("gstReturn.downloadHsnB2c")}
            </Button>
            {r.hsnB2b.length > 0 ? (
              <Button variant="secondary" size="sm" icon={Download} onClick={() => downloadAll("hsnB2b")}>
                {t("gstReturn.downloadHsnB2b")}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">{t("gstReturn.dueDates")}</p>
        </div>
      )}
    </Card>
  );
}
