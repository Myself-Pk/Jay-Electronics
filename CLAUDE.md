# Jay Electronics — shop app

Billing, stock, udhaar, purchases and warranty app for Jay Electronics (battery & inverter shop, Bokaro, Jharkhand).
Full product plan: `PLAN.md` (read it before starting a new feature; follow the week-by-week order in section 12).

## Stack
- React 19 + TypeScript 7 + Vite 8, Tailwind CSS v4 (theme tokens in `src/index.css`), React Router 8 (`react-router`).
- Supabase (Postgres + Auth) as the backend. Schema in `supabase/migrations/`. Check SQL with `npm run check:schema` (runs it in PGlite).
- i18n: `react-i18next`, strings in `src/i18n/en.ts` and `src/i18n/hi.ts`. **Every user-visible string goes through `t()`** and must exist in both files.
- Tests: Vitest (`npm test`). Money, bill-number and GST logic must have tests.
- Preview mode: when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing, the data layer (`src/data/*`) serves in-memory sample data from `src/data/preview-store.ts`. Screens never talk to Supabase directly — always go through `src/data/*`.

## Billing (how it fits together)
- `supabase/migrations/*_billing.sql` → `save_bill(jsonb)` is the source of truth: it recalculates every amount, assigns the bill number, sells serial units, updates stock, customers, payments, scrap and Bajaj deals in one transaction, and raises `bill_error('<code>')` for anything the person can fix (shown via `billErrors.<code>` in i18n).
- `src/data/preview-billing.ts` mirrors those rules for Preview mode. **If you change save_bill / cancel_bill, change the preview version too**, and add a check to `scripts/check-schema.mjs`.
- `src/lib/billMath.ts` holds the shared arithmetic (card charges rounded to whole rupees, scrap by weight, totals). `src/pages/bills/billDraft.ts` is the New Bill screen's validation; both have tests.
- The printed bill (`BillSheet.tsx`) is always English. Customers open bills at `/b/<share_token>` without logging in.

## Products and stock
- `save_product(jsonb)` (owner only) and `receive_stock(jsonb)` (anyone logged in) in `*_products_stock.sql`; Preview copies in `src/data/preview-stock.ts` — keep them in step.
- Serial-numbered items get stock only by scanning serials (New stock arrived, or its "Opening stock" mode). Count-based items can also get opening stock when the product is added or imported.
- The stock-list import (`src/pages/stock/stockImport.ts`) reads `stock-list-template.csv` saved from Excel as CSV.
- `npm run dev:demo` runs the app on port 5174 in Preview mode (sample data) even when `.env.local` has the real keys.

## Database permissions
- Supabase no longer exposes new tables automatically, and `*_api_grants.sql` closes every function by default. **Any new table or function in a later migration needs its own `grant`** (tables: select/insert/update to `authenticated`, never delete; functions: `grant execute ... to authenticated`, or `anon` only for things used before login). Add a check for it in `scripts/check-schema.mjs`.
- Apply migrations to the real project with `npm run db:migrate` (needs `SUPABASE_DB_URL` in `.env.local`), or via the Supabase MCP connector. Add logins with `npm run add-person` in a real terminal (the PIN is typed hidden).

## Commands
- `npm run dev` — dev server on http://localhost:5173
- `npm test` — unit tests
- `npm run build` — type-check + production build
- `npm run check:schema` — verify migrations run on a fresh Postgres

## Design rules (the users are non-technical — this matters more than features)
1. Everyday words, never accounting jargon: "Bill" (not invoice), "Udhaar / Dues" (not receivables), "New stock arrived" (not purchase entry/GRN), "Change stock" (not adjustment), "Return / Refund" (not credit note).
2. Big tap targets (buttons ≥ 44px tall; main actions 56px+), readable 16px+ text, one main action per screen.
3. Smart defaults; type as little as possible. One search box finds anything.
4. **Confirm before anything that changes money or stock** — use `useConfirm()` with a plain-language summary (e.g. "Amaron 150Ah: 8 → 7").
5. Friendly messages, never error codes or stack traces (e.g. "This battery was already sold on bill 0123 to Sunil Kumar").
6. Look: white cards on a light slate background, one brand colour (deep blue `brand-*`), green = money in, red only for dues/warnings, amber for "needs attention".
7. Money always shown in Indian format via `formatRupees()` (₹1,23,456.50). Digits stay Latin in Hindi mode.
8. Works on the counter PC (keyboard + barcode scanner) and on the owner's Android phone.

## Business rules (agreed with the owner)
- **Money**: stored in the database as `numeric(12,2)` (exact decimals). In TypeScript, do all arithmetic in **integer paise** using `src/lib/money.ts` (`toPaise`, `fromPaise`, `percentOf`…). Never do money math on floating-point rupees.
- **Bills are never deleted or edited after saving** — only cancelled (owner only, with a reason). Bill numbers are never reused.
- **Bill numbers**: `PREFIX/YY-YY/NNNN` (e.g. `JE/26-27/0001`), new series every financial year (April–March), max 16 characters, starting number configurable. See `src/lib/billNumber.ts`.
- **GST**: shop is on the **Composition scheme** → bills are titled "BILL OF SUPPLY", carry the line "Composition taxable person, not eligible to collect tax on supplies", and show no GST. A setting switches to Regular GST later, so GST fields (hsn, gst_rate, gst_amount) exist from day 1. GST rates are editable per product.
- Under composition, GST paid on purchases is part of the cost (not claimable).
- **Stock** may be changed directly, but every change ends with a confirmation popup and is written to `stock_history`. Current stock is always derived from `stock_history`/`units`, never a free-typed number.
- Nothing is hard-deleted (GST records are kept ~6 years). Use `active = false` or `status = 'cancelled'`.
- Owner-only data (purchase prices, profit, settings) must be protected in the database (RLS / owner-only tables or functions), not just hidden in the UI.
- **Backups**: automatic daily backup to a folder on the shop PC (+ Google Drive sync) — at most 1 day of data may ever be lost.
- Logins: every person has their own 6-digit PIN (used as their Supabase password). The counter PC stays logged in; people switch with "Billing by".

## Defaults (editable in Settings)
Scrap (old battery) rate ₹105/kg · delivery presets ₹200/₹300/₹500 · composition rate 1% · state Jharkhand (code 20).
