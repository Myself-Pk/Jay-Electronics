import { useMemo, useState } from "react";
import { ChevronRight, FileSpreadsheet, Package, PackagePlus, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { listCatalog, searchCatalog } from "@/data/catalog";
import { listBrandNames, listCategories } from "@/data/products";
import { canSeeOwnerData, productLabel, type CatalogProduct } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";
import { useAsync } from "@/lib/useAsync";
import { ImportDialog } from "./ImportDialog";
import { ProductDialog } from "./ProductDialog";

export const isLow = (p: CatalogProduct) => !p.isService && p.lowStockLevel > 0 && p.inStock <= p.lowStockLevel;

function StockBadge({ product }: { product: CatalogProduct }) {
  const { t } = useTranslation();
  if (product.isService) return <Badge>{t("stock.service")}</Badge>;
  if (product.inStock <= 0) return <Badge tone="red">{t("stock.outOfStock")}</Badge>;
  return <Badge tone={isLow(product) ? "amber" : "green"}>{t("stock.inStock", { count: product.inStock })}</Badge>;
}

export function StockPage() {
  const { t } = useTranslation();
  const { person } = useSession();
  const isOwner = canSeeOwnerData(person?.role);
  const catalog = useAsync(listCatalog);
  const categories = useAsync(listCategories);
  const brands = useAsync(listBrandNames);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState<CatalogProduct | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const products = catalog.data ?? [];
  const usedCategories = (categories.data ?? []).filter((c) => products.some((p) => p.categoryId === c.id));
  const shown = useMemo(() => {
    const base = query.trim() ? searchCatalog(products, query, Number.POSITIVE_INFINITY) : products;
    return base
      .filter((p) => categoryId === "all" || p.categoryId === categoryId)
      .filter((p) => !lowOnly || isLow(p) || (!p.isService && p.inStock <= 0))
      .sort((a, b) => a.categoryOrder - b.categoryOrder || productLabel(a).localeCompare(productLabel(b)));
  }, [products, query, categoryId, lowOnly]);

  const reload = () => {
    catalog.reload();
    brands.reload();
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
      active ? "border-brand-700 bg-brand-50 text-brand-900" : "border-slate-300 bg-white text-slate-700 hover:border-brand-300",
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("stock.title")}</h1>
          <p className="mt-1 text-[15px] text-slate-500">{t("stock.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImporting(true)}>
                {t("stock.import")}
              </Button>
              <Button variant="secondary" icon={Plus} onClick={() => setOpen("new")}>
                {t("stock.addProduct")}
              </Button>
            </>
          ) : null}
          <LinkButton to="/purchases/new" icon={PackagePlus}>
            {t("stock.newStock")}
          </LinkButton>
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">{t("stock.searchPlaceholder")}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("stock.searchPlaceholder")}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-11 text-[15px] shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100 focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={chip(categoryId === "all")} onClick={() => setCategoryId("all")}>
          {t("stock.all")}
        </button>
        {usedCategories.map((c) => (
          <button key={c.id} type="button" className={chip(categoryId === c.id)} onClick={() => setCategoryId(c.id)}>
            {c.name}
          </button>
        ))}
        <button type="button" className={cn(chip(lowOnly), lowOnly && "border-amber-500 bg-amber-50 text-amber-900")} onClick={() => setLowOnly((v) => !v)}>
          {t("stock.lowOnly")}
        </button>
      </div>

      <Card>
        {catalog.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Package className="size-10 text-slate-300" />
            <p className="text-[15px] text-slate-600">{products.length === 0 ? t("stock.empty") : t("stock.noMatch")}</p>
          </div>
        ) : (
          <>
            <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 sm:px-6">
              {t("stock.count", { count: shown.length })}
            </p>
            <ul className="divide-y divide-slate-100">
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(p)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 sm:px-6"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">{productLabel(p)}</span>
                      <span className="block text-sm text-slate-500">
                        {p.category}
                        {p.retailPrice > 0 ? ` · ${formatRupees(p.retailPrice)}` : ""}
                      </span>
                    </span>
                    <StockBadge product={p} />
                    <ChevronRight className="size-5 shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {categories.data && person ? (
        <>
          <ProductDialog
            open={open !== null}
            product={open === "new" ? null : open}
            categories={categories.data}
            brands={brands.data ?? []}
            role={person.role}
            onClose={() => setOpen(null)}
            onSaved={reload}
          />
          <ImportDialog
            open={importing}
            categories={categories.data}
            catalog={products}
            role={person.role}
            onClose={() => setImporting(false)}
            onImported={reload}
          />
        </>
      ) : null}
    </div>
  );
}
