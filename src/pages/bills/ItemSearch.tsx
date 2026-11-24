import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Camera, ScanBarcode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CameraScanner, type ScanOutcome } from "@/components/CameraScanner";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/Confirm";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { findProductByBarcode, linkBarcode } from "@/data/barcodes";
import { searchCatalog } from "@/data/catalog";
import { asBillError } from "@/data/errors";
import { productLabel, type CatalogProduct } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";

export interface PickOptions {
  /** True when the product came from a scanned barcode / QR code (scanning again adds one more). */
  scanned?: boolean;
}

interface Props {
  catalog: CatalogProduct[];
  onPick: (product: CatalogProduct, options?: PickOptions) => void;
  /** Called on Enter before picking a result; return true if it was handled (e.g. a scanned serial). */
  onEnterText: (text: string) => Promise<boolean>;
  /** Defaults to the New Bill wording ("Scan barcode or type…"). */
  placeholder?: string;
}

/** Typed text that looks like a code rather than a search: no spaces, 6+ characters, has a digit. */
const looksLikeCode = (text: string) => !/\s/.test(text) && text.length >= 6 && /\d/.test(text);

/**
 * One box for typing, a USB barcode scanner and the phone camera.
 * - Typing "150ah amaron" shows matching products.
 * - A scanned code (scanner or camera) that was linked to a product adds that product.
 * - A new code asks once "Which product is this?" and remembers it.
 */
export function ItemSearch({ catalog, onPick, onEnterText, placeholder }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [newCode, setNewCode] = useState<{ code: string; fromCamera: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCatalog(catalog, query), [catalog, query]);

  const pick = (product: CatalogProduct, options?: PickOptions) => {
    onPick(product, options);
    setQuery("");
    setHighlight(0);
    if (!cameraOpen) inputRef.current?.focus();
  };

  /** A code from the camera or a scanner: a linked product, else the screen's own check (serials). */
  const handleCode = async (code: string): Promise<{ result: "added" | "handled" | "unknown"; label: string }> => {
    const productId = await findProductByBarcode(code).catch(() => null);
    const product = productId ? catalog.find((p) => p.id === productId) : undefined;
    if (product) {
      pick(product, { scanned: true });
      return { result: "added", label: productLabel(product) };
    }
    if (await onEnterText(code)) return { result: "handled", label: code };
    return { result: "unknown", label: code };
  };

  const onCameraCode = async (code: string): Promise<ScanOutcome> => {
    const { result, label } = await handleCode(code);
    if (result === "unknown") {
      // Ask which product it is; the camera reopens afterwards.
      setCameraOpen(false);
      setNewCode({ code, fromCamera: true });
      return { kind: "stop" };
    }
    return { kind: "added", label };
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const text = query.trim();
      if (!text || busy) return;
      setBusy(true);
      try {
        const { result } = await handleCode(text);
        if (result !== "unknown") {
          setQuery("");
          setHighlight(0);
          return;
        }
        // Not a known code: pick the highlighted search result, or offer to link a new code.
        if (results.length === 0 && looksLikeCode(text)) {
          setQuery("");
          setNewCode({ code: text, fromCamera: false });
          return;
        }
      } finally {
        setBusy(false);
      }
      const chosen = results[highlight];
      if (chosen) pick(chosen);
    }
  };

  /** "Which product is this?" — remember the code for that product, then add it. */
  const linkAndPick = async (product: CatalogProduct) => {
    if (!newCode) return;
    const { code, fromCamera } = newCode;
    try {
      try {
        await linkBarcode(code, product.id);
      } catch (err) {
        const be = asBillError(err);
        if (be?.code !== "barcode_taken") throw err;
        const ok = await confirm({
          title: t("scan.takenTitle", { product: String(be.details.product ?? "") }),
          message: t("scan.takenText", { product: productLabel(product) }),
          confirmLabel: t("scan.takenYes"),
        });
        if (!ok) return;
        await linkBarcode(code, product.id, true);
      }
      setNewCode(null);
      pick(product, { scanned: true });
      toast(t("scan.linked", { product: productLabel(product) }));
      if (fromCamera) setCameraOpen(true);
    } catch (err) {
      const be = asBillError(err);
      toast(be ? t(`billErrors.${be.code}`, be.details) : t("common.somethingWrong"), "error");
    }
  };

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">{t("newBill.searchPlaceholder")}</span>
        <ScanBarcode className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id="item-search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => void onKeyDown(e)}
          placeholder={placeholder ?? t("newBill.searchPlaceholder")}
          className="h-14 w-full rounded-2xl border border-slate-300 bg-white pr-16 pl-13 text-[17px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
        />
      </label>
      <button
        type="button"
        onClick={() => setCameraOpen(true)}
        aria-label={t("scan.button")}
        title={t("scan.button")}
        className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm hover:bg-brand-800"
      >
        <Camera className="size-5" />
      </button>
      {open && query.trim() ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {results.length === 0 ? (
            <p className="px-4 py-3.5 text-[15px] text-slate-500">{t("newBill.noMatch", { q: query.trim() })}</p>
          ) : (
            <ul role="listbox">
              {results.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(p)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left",
                      i === highlight ? "bg-brand-50" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">{productLabel(p)}</span>
                      <span className="block text-sm text-slate-500">{p.category}</span>
                    </span>
                    {p.isService ? (
                      <Badge>{t("newBill.service")}</Badge>
                    ) : p.inStock > 0 ? (
                      <Badge tone="green">{t("newBill.inStock", { count: p.inStock })}</Badge>
                    ) : (
                      <Badge tone="amber">{t("newBill.outOfStock")}</Badge>
                    )}
                    {p.retailPrice > 0 ? (
                      <span className="w-20 text-right text-[15px] font-semibold text-slate-800 tabular-nums">
                        {formatRupees(p.retailPrice)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onCode={onCameraCode} />
      <LinkCodeDialog
        code={newCode?.code ?? null}
        catalog={catalog}
        onCancel={() => {
          const fromCamera = newCode?.fromCamera;
          setNewCode(null);
          if (fromCamera) setCameraOpen(true);
        }}
        onChoose={(p) => void linkAndPick(p)}
      />
    </div>
  );
}

/** "New code — which product is this?" with its own search box. */
function LinkCodeDialog({
  code,
  catalog,
  onCancel,
  onChoose,
}: {
  code: string | null;
  catalog: CatalogProduct[];
  onCancel: () => void;
  onChoose: (product: CatalogProduct) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const goods = useMemo(() => catalog.filter((p) => !p.isService), [catalog]);
  const matches = useMemo(() => (q.trim() ? searchCatalog(goods, q, 8) : []), [goods, q]);

  return (
    <Dialog
      open={code !== null}
      onClose={() => {
        setQ("");
        onCancel();
      }}
      title={t("scan.linkTitle")}
      description={t("scan.linkText")}
    >
      <div className="flex flex-col gap-3 pb-2">
        <p className="rounded-xl bg-slate-100 px-4 py-2.5 font-mono text-[15px] font-semibold break-all text-slate-800">{code}</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("scan.linkSearch")} data-autofocus autoComplete="off" />
        {matches.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    onChoose(p);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">{productLabel(p)}</span>
                    <span className="block text-sm text-slate-500">{p.category}</span>
                  </span>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">{formatRupees(p.retailPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : q.trim() ? (
          <p className="text-[15px] text-slate-500">{t("newBill.noMatch", { q: q.trim() })}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
