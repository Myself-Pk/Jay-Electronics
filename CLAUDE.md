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

## Switched off for now (owner's choice, Nov 2026)
- `src/lib/features.ts`: `purchasePrices: false` hides purchase price, distributor rates, purchase totals and all profit figures; `serialNumbers: false` makes every product count-based (no serial switch, no scanning). The database still supports both — flip the switch to bring them back.
- Warranty no longer depends on serials: product warranty months print on every bill line (`bill_items_warranty_text` trigger in `*_warranty_without_serials.sql`), and "Add old sale" accepts any non-service product.
- Warranty can be changed per bill line on New Bill (`lineWarranty()` in `billDraft.ts`); the app sends `warranty_free_months` / `warranty_prorata_months` per item. `save_bill` is a thin wrapper (`*_bill_warranty_choice.sql`) that checks them, stores them for the transaction (`je.bill_warranty`) and calls the original, renamed `save_bill_core` (not callable by the app). Edit billing rules in `save_bill_core`.
- Product warranty months were filled with best guesses from online listings on 24 Nov 2026 (only Luminous "72 Months" is confirmed); correct them in Stock as real labels are checked.
- Bills are sent as a PDF (`src/lib/billPdf.ts`: html-to-image + jsPDF, lazy-loaded) through the share menu; free WhatsApp links can't carry files.
- The real stock list (107 products, 190 pieces, selling prices only) was loaded on 24 Nov 2026 after wiping all test data; a backup of the test data is in `backups/2026-11-24_2107`.

## Products and stock
- `save_product(jsonb)` (owner only) and `receive_stock(jsonb)` (anyone logged in) in `*_products_stock.sql`; Preview copies in `src/data/preview-stock.ts` — keep them in step.
- Serial-numbered items get stock only by scanning serials (New stock arrived, or its "Opening stock" mode). Count-based items can also get opening stock when the product is added or imported.
- The stock-list import (`src/pages/stock/stockImport.ts`) reads `stock-list-template.csv` saved from Excel as CSV.
- `npm run dev:demo` runs the app on port 5174 in Preview mode (sample data) even when `.env.local` has the real keys.

## Udhaar, Bajaj and backups
- `receive_payment(jsonb)` applies a customer's money to their oldest unpaid bills first; `settle_finance(jsonb)` marks Bajaj money received; `v_customer_dues` lists dues. Preview copies in `src/data/preview-payments.ts`.
- `npm run backup` (scripts/backup.mjs) saves a dated folder (full JSON + Excel-readable CSVs) to `BACKUP_DIR` or `backups/`, logs it in `backup_log` (shown on Home). `npm run backup:schedule` registers an hourly hidden Windows task (`--if-due`: one backup a day after 7 PM, or immediately if the last is >24 h old). `npm run restore -- <folder>` puts a backup into an empty project (logins get temporary PINs). Dates must stay as `yyyy-mm-dd` strings (pg type parser 1082) or restores shift a day.

## Home, Reports and Close Day
- Home's week/month numbers come from `dashboard_summary()` (`*_dashboard.sql`); Preview copy in `src/data/dashboard.ts`.
- Reports and Close Day add up plain rows with `buildReport()` in `src/lib/report.ts` (tested) — the same function for live data and Preview (`src/data/reports.ts`), so they always agree. Long ranges are read in pages of 1,000 rows.
- `close_day(jsonb)` (`*_close_day.sql`) works out the expected cash itself (start cash + cash in − cash out − cash expenses) and can be re-run for the same day. Expenses are inserted directly (RLS: anyone adds, owner cancels); categories are keys (`tea`, `transport`…) translated via `closeDay.cats.*`.

- GST return (Regular): `gstReturn()` in `src/lib/gstReturn.ts` (tested) turns a period's bills (`getGstBills()` in `src/data/reports.ts`) into GSTR-3B 3.1(a)/3.2 and GSTR-1 B2B, B2CS, HSN (B2B and B2C apart) and documents issued; `gstr1Csv()` writes them in the GST offline tool's columns. Bills made without GST and old "Bill of Supply" bills still owe GST and are included (worked out at the product's rate). Shown in Reports (`GstReturnCard.tsx`) for the dates picked there ("Last quarter" preset for QRMP).
- GST 2.0 rates (22 Sep 2025): batteries (8507) 18%, inverters/UPS/stabilizers/chargers (8504) 18%, solar panels 5%, solar inverters and solar charge controllers 5% (category defaults set in `*_gst_rates_2025.sql`), services 18%.

## Warranty Check
- `v_warranty_units` (security_invoker view) + `warranty_search(text)` (serial part ≥3 chars, 10-digit mobile, bill number or its sequence) + `add_old_sale(jsonb)` (paper-register sales: unit `status='sold'`, `source='old_register'`, no stock change) in `*_warranty.sql`; Preview copies in `src/data/warranty.ts`.
- Registration to-do = sold units of brands with `warranty_registration_required`, not yet registered, **excluding old_register** (same rule in `v_attention_counts`). Pending from an earlier day shows red. Warranty maths in `src/lib/warranty.ts` (tested).

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
- **GST**: the shop is a **Regular GST** dealer (GSTIN 20AEMPK3613H1ZW, M/S Jay Electronics, prop. Bablu Kumar Kundu; Regular from 24 Nov 2026 in Settings). Bills are **Tax Invoices**; **prices are GST-inclusive** (customer pays the same; each line's GST = amount × rate / (100 + rate), to the paisa — `gstInside()` in `billMath.ts`, same formula in `save_bill_core`). CGST + SGST inside Jharkhand (20), IGST when a business customer's GSTIN is from another state. Card/Bajaj charges carry 18% inside them; the old-battery credit comes off after tax. A bill can be made **without GST** only after a confirm popup → plain "BILL" (`title = 'bill'`, no GSTIN/tax). Composition (if ever switched back) still gives a Bill of Supply. GST rates and HSN are per product (categories give defaults).
- **Stock** may be changed directly, but every change ends with a confirmation popup and is written to `stock_history`. Current stock is always derived from `stock_history`/`units`, never a free-typed number.
- Nothing is hard-deleted (GST records are kept ~6 years). Use `active = false` or `status = 'cancelled'`.
- Owner-only data (purchase prices, profit, settings) must be protected in the database (RLS / owner-only tables or functions), not just hidden in the UI.
- **Backups**: automatic daily backup to a folder on the shop PC (+ Google Drive sync) — at most 1 day of data may ever be lost.
- Logins: every person has their own 6-digit PIN (used as their Supabase password). The counter PC stays logged in; people switch with "Billing by".

## Defaults (editable in Settings)
Scrap (old battery) rate ₹105/kg · delivery presets ₹200/₹300/₹500 · composition rate 1% · state Jharkhand (code 20).
