import { useState } from "react";
import { CircleAlert, CircleCheck, FileSpreadsheet, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { asBillError } from "@/data/errors";
import { saveProduct } from "@/data/products";
import type { CatalogProduct, Category, Role } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";
import { readStockList, type ImportRow } from "./stockImport";

interface Props {
  open: boolean;
  categories: Category[];
  catalog: CatalogProduct[];
  role: Role;
  onClose: () => void;
  onImported: () => void;
}

/** Load the shop's stock list (the CSV template) in one go. */
export function ImportDialog({ open, categories, catalog, role, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<Record<number, string>>({});
  const [imported, setImported] = useState<Set<number>>(new Set());

  const reset = () => {
    setFileName("");
    setRows(null);
    setProgress(null);
    setFailures({});
    setImported(new Set());
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setRows(readStockList(await file.text(), categories, catalog));
  };

  const ready = (rows ?? []).filter((r) => r.status === "ready" && !imported.has(r.line));
  const counts = {
    ok: (rows ?? []).filter((r) => r.status === "ready").length,
    bad: (rows ?? []).filter((r) => r.status === "problem").length,
    skipped: (rows ?? []).filter((r) => r.status === "skipped").length,
  };

  const run = async () => {
    const todo = ready;
    const failed: Record<number, string> = {};
    const done = new Set(imported);
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      try {
        await saveProduct(row.input!, role);
        done.add(row.line);
      } catch (e) {
        const be = asBillError(e);
        failed[row.line] = be ? t(`billErrors.${be.code}`, be.details as Record<string, string>) : t("common.somethingWrong");
      }
      setProgress({ done: i + 1, total: todo.length });
    }
    setImported(done);
    setFailures(failed);
    setProgress(null);
    onImported();
  };

  const finished = imported.size > 0 && ready.length === 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title={t("stock.importer.title")}
      description={t("stock.importer.description")}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={close}>
            {t("common.close")}
          </Button>
          {rows && !finished ? (
            <Button size="lg" disabled={ready.length === 0} loading={progress !== null} onClick={() => void run()}>
              {progress ? t("stock.importer.running", progress) : t("stock.importer.run", { count: ready.length })}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 hover:border-brand-400 hover:bg-brand-50">
          <FileSpreadsheet className="size-7 text-brand-700" />
          <span className="flex-1 text-[15px] font-semibold text-slate-800">{fileName || t("stock.importer.choose")}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {rows ? (
          <>
            {finished ? (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] font-semibold text-emerald-800">
                <CircleCheck className="size-5" />
                {t("stock.importer.done", { count: imported.size })}
                {Object.keys(failures).length > 0 ? ` · ${t("stock.importer.someFailed", { count: Object.keys(failures).length })}` : ""}
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-600">{t("stock.importer.summary", counts)}</p>
            )}
            <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">{t("stock.importer.product")}</th>
                    <th className="px-3 py-2 font-semibold">{t("stock.importer.category")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("stock.importer.price")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("stock.importer.stock")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const failure = failures[r.line];
                    const isDone = imported.has(r.line);
                    return (
                      <tr key={r.line} className={cn(r.status === "skipped" && "text-slate-400")}>
                        <td className="px-3 py-2 align-top text-slate-400">{r.line}</td>
                        <td className="px-3 py-2 align-top">
                          <p className="font-semibold text-slate-800">{r.label}</p>
                          {r.status === "skipped" ? <p className="text-xs">{t("stock.importer.skipped")}</p> : null}
                          {r.problems.map((p, i) => (
                            <p key={i} className="flex items-center gap-1 text-xs font-medium text-red-600">
                              <CircleAlert className="size-3.5" />
                              {t(`stock.importer.problems.${p.key}`, p.params)}
                            </p>
                          ))}
                          {failure ? <p className="text-xs font-medium text-red-600">{failure}</p> : null}
                          {isDone ? (
                            <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <CircleCheck className="size-3.5" />
                              {t("stock.importer.ready")}
                            </p>
                          ) : null}
                          {r.needsSerialScan && r.status === "ready" ? (
                            <p className="flex items-center gap-1 text-xs text-slate-500">
                              <Info className="size-3.5" />
                              {t("stock.importer.serialNote")}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-600">{r.categoryName}</td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">{r.price !== null ? formatRupees(r.price) : "—"}</td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">{r.stock ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
