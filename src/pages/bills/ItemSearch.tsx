import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ScanBarcode } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { searchCatalog } from "@/data/catalog";
import { productLabel, type CatalogProduct } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";

interface Props {
  catalog: CatalogProduct[];
  onPick: (product: CatalogProduct) => void;
  /** Called on Enter before picking a result; return true if it was handled (e.g. a scanned serial). */
  onEnterText: (text: string) => Promise<boolean>;
  /** Defaults to the New Bill wording ("Scan barcode or type…"). */
  placeholder?: string;
}

/**
 * One box for both barcode scanners and typing.
 * A scanner types the serial and presses Enter; typing "150ah amaron" shows matching products.
 */
export function ItemSearch({ catalog, onPick, onEnterText, placeholder }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCatalog(catalog, query), [catalog, query]);

  const pick = (product: CatalogProduct) => {
    onPick(product);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
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
        if (await onEnterText(text)) {
          setQuery("");
          setHighlight(0);
          return;
        }
      } finally {
        setBusy(false);
      }
      const chosen = results[highlight];
      if (chosen) pick(chosen);
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
          className="h-14 w-full rounded-2xl border border-slate-300 bg-white pr-4 pl-13 text-[17px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
        />
      </label>
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
    </div>
  );
}
