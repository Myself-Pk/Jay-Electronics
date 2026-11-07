/**
 * Reads the shop's stock list (stock-list-template.csv, saved from Excel as CSV)
 * into products ready to save, with a friendly problem list per row.
 */
import { productLabel, type CatalogProduct, type Category, type ProductInput } from "@/data/types";
import { parseRupees, type Paise } from "@/lib/money";

/** Split CSV text into rows of cells. Handles quotes, commas inside quotes, CRLF and Excel's BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Match what people write ("Accessory", "Automotive battery - car", "Inverter") to a category. */
export function matchCategory(text: string, categories: Category[]): Category | null {
  const t = text.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (!t) return null;
  const byName = (name: string) => categories.find((c) => c.name.toLowerCase() === name) ?? null;
  const exact = categories.find((c) => c.name.toLowerCase().replace(/[^a-z]+/g, " ").trim() === t);
  if (exact) return exact;
  if (/\b(car|bike|truck|tractor|rickshaw|automotive|vehicle)\b/.test(t)) return byName("automotive battery");
  if (/\blithium\b/.test(t)) return byName("lithium battery");
  if (/\bsolar\b/.test(t) && /\b(panel|module)\b/.test(t)) return byName("solar panel");
  if (/\bsolar\b/.test(t) || /\bpcu\b/.test(t)) return byName("solar inverter / pcu");
  if (/\bcharge\b/.test(t) && /\bcontroller\b/.test(t)) return byName("charge controller");
  if (/\bstabili[sz]er\b/.test(t)) return byName("stabilizer");
  if (/\binverter\b/.test(t) && /\bbatter/.test(t)) return byName("inverter battery");
  if (/\b(inverter|ups)\b/.test(t)) return byName("inverter / ups");
  if (/\bbatter/.test(t)) return byName("inverter battery");
  if (/\baccessor/.test(t)) return byName("accessories");
  if (/\bservice/.test(t)) return byName("services");
  return null;
}

export interface ImportProblem {
  key: string;
  params?: Record<string, string>;
}

export interface ImportRow {
  /** Row number in the file (header is row 1). */
  line: number;
  label: string;
  categoryName: string;
  price: Paise | null;
  stock: number | null;
  status: "ready" | "problem" | "skipped";
  problems: ImportProblem[];
  /** Batteries etc. whose stock must be scanned instead of typed. */
  needsSerialScan: boolean;
  input?: ProductInput;
}

const COLUMNS: [keyof Omit<Record<string, number>, never>, (h: string) => boolean][] = [
  ["category", (h) => h.includes("category")],
  ["brand", (h) => h.includes("brand")],
  ["model", (h) => h.includes("model") || h === "name" || h === "product"],
  ["capacity", (h) => h.includes("capacity") || h === "size"],
  ["type", (h) => h === "type"],
  ["hasSerial", (h) => h.includes("serial")],
  ["mrp", (h) => h === "mrp"],
  ["retail", (h) => h.includes("retail") || h === "price" || h.includes("selling")],
  ["dealer", (h) => h.includes("dealer")],
  ["purchase", (h) => h.includes("purchase") || h.includes("cost")],
  ["free", (h) => h.includes("free")],
  ["prorata", (h) => h.includes("pro-rata") || h.includes("prorata") || h.includes("pro rata")],
  ["stock", (h) => h.includes("stock qty") || h.includes("current stock") || h === "stock" || h === "qty"],
  ["low", (h) => h.includes("low stock")],
  ["hsn", (h) => h.includes("hsn")],
  ["notes", (h) => h.includes("note")],
];

export function readStockList(text: string, categories: Category[], existing: CatalogProduct[]): ImportRow[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const heads = header.map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  for (const [key, test] of COLUMNS) {
    const i = heads.findIndex((h, idx) => test(h) && !Object.values(col).includes(idx));
    if (i >= 0) col[key] = i;
  }
  const keyOf = (brand: string, model: string, capacity: string) =>
    [brand, model, capacity].map((s) => s.trim().toLowerCase()).join("|");
  const known = new Set(existing.map((p) => keyOf(p.brand ?? "", p.model, p.capacity)));
  const inFile = new Set<string>();

  return rows.map((cells, i) => {
    const get = (key: string) => (col[key] === undefined ? "" : (cells[col[key]] ?? "").trim());
    const problems: ImportProblem[] = [];
    const brand = get("brand");
    const model = get("model");
    const capacity = get("capacity");
    const label = productLabel({ brand, model, capacity }) || "—";
    const category = matchCategory(get("category"), categories);
    const base = { line: i + 2, label, categoryName: category?.name ?? get("category"), needsSerialScan: false };

    if (/^example/i.test(get("notes"))) {
      return { ...base, price: null, stock: null, status: "skipped" as const, problems: [] };
    }

    if (!category) problems.push({ key: "category", params: { value: get("category") } });
    if (!model) problems.push({ key: "model" });

    const money = (key: string): Paise | null => {
      const raw = get(key);
      if (!raw) return null;
      const value = parseRupees(raw);
      if (value === null || value < 0) {
        problems.push({ key: "price", params: { value: raw } });
        return null;
      }
      return value;
    };
    const whole = (key: string): number | null => {
      const raw = get(key);
      if (!raw) return null;
      if (!/^\d+$/.test(raw)) {
        problems.push({ key: "number", params: { value: raw } });
        return null;
      }
      return Number(raw);
    };
    const mrp = money("mrp");
    const retail = money("retail");
    const dealer = money("dealer");
    const purchase = money("purchase");
    const free = whole("free");
    const prorata = whole("prorata");
    const stock = whole("stock");
    const low = whole("low");
    if (mrp !== null && retail !== null && retail > mrp) problems.push({ key: "aboveMrp" });

    const serialText = get("hasSerial").toLowerCase();
    const hasSerial = category?.isService
      ? false
      : serialText
        ? /^(y|yes|true|1|haan|ha)$/.test(serialText)
        : (category?.hasSerialByDefault ?? true);

    const key = keyOf(brand, model, capacity);
    if (model && known.has(key)) problems.push({ key: "duplicate" });
    else if (model && inFile.has(key)) problems.push({ key: "duplicateInFile" });
    inFile.add(key);

    const row = { ...base, price: retail, stock, needsSerialScan: hasSerial && (stock ?? 0) > 0 };
    if (problems.length > 0 || !category) return { ...row, status: "problem" as const, problems };
    return {
      ...row,
      status: "ready" as const,
      problems,
      input: {
        categoryId: category.id,
        brand,
        model,
        capacity,
        type: get("type"),
        mrp,
        retailPrice: retail ?? 0,
        dealerPrice: dealer,
        minPrice: null,
        hasSerial,
        warrantyFreeMonths: hasSerial ? (free ?? 0) : 0,
        warrantyProrataMonths: hasSerial ? (prorata ?? 0) : 0,
        lowStockLevel: low ?? 0,
        hsn: get("hsn"),
        gstRate: null,
        purchasePrice: purchase,
        ...(!hasSerial && !category.isService && stock ? { openingStock: stock } : {}),
      },
    };
  });
}
