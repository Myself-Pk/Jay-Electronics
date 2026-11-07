# Jay Electronics: Shop Management App, Project Plan

*Version 2 · updated 7 Nov 2026 with Papa's answers · Jay Electronics, Bokaro (Jharkhand)*

---

## 1. Summary

**What:** one simple app for billing, stock, customers and udhaar, purchases, warranty and service at Jay Electronics.

- It runs on the counter computer, which is the only billing system.
- Papa can check sales and stock on his phone.

**Cost:** **₹0 per month.** It's built on free services, and daily backups are saved on the shop computer.

**Look and feel:** simple, clean and professional. It uses everyday words, not accounting jargon, and has Hindi and English labels. If Papa has to ask how to do something, that screen gets fixed.

**When:**
- The basic app is ready in about 6 weeks (by 20 Dec 2026).
- Real billing on the app starts **4 Jan 2027**.
- Paper is no longer needed by **18 Jan 2027**.
- Everything is settled well before the April–June inverter season.

---

## 2. Decisions so far

| Topic | Decision |
|-------|----------|
| GST | **Composition scheme**, so the shop issues a *Bill of Supply* with no GST added. A setting can **switch to Regular GST later**. The GSTIN comes later. **No CA**, so the app produces the numbers needed for GST filing |
| Volume | About **10 bills a day** |
| Staff and computers | Papa plus **2 staff**. **One counter computer** does all billing |
| Brands | Amaron, Exide, Microtek, Luminous and Livguard to start. **The full stock list comes later** in the template file `stock-list-template.csv` |
| Barcodes | **Yes**, serial numbers on boxes can be scanned |
| Current records | Paper register only, so opening stock and udhaar are entered once at go-live |
| Prices | **Retail and dealer prices** (mechanics, electricians, small shops) |
| Old battery exchange | **₹105 per kg** by default (changeable), or a **fixed amount** when needed |
| Warranty complaints | Most brands do **home service**. The shop registers the complaint with the brand and follows up |
| Payment modes | Cash, UPI, **debit card, credit card and Bajaj Finance**, with **extra charges added** for card and finance |
| Delivery and installation | Yes, **₹200–₹500 extra** |
| Repair and charging | Yes, offered |
| Printing | **A4** |
| Dashboard | **Weekly and monthly sales, low stock, bestsellers**, plus more (section 7) |
| Brand warranty registration | **Required**: Exide and Amaron are especially strict |
| Budget | **Free** |

### Agreed rules

1. **Money is stored as exact decimals** (₹1,234.50).
   - Calculations use exact decimal math, so the app never has a paisa rounding error.
   - Ordinary computer numbers can turn ₹0.10 + ₹0.20 into ₹0.30000000000000004, which is why this matters.
2. **Stock can be changed directly, but every stock change ends with a confirmation popup** showing what will change (for example, "Amaron 150Ah: 8 → 7. Confirm?").
   - The app also quietly keeps a history of who changed what and when. It adds no extra work, and it answers "why is stock wrong?" later.
3. **Bills are never deleted, only cancelled.**
   - A cancelled bill stays on record with a CANCELLED stamp.
   - Its number is never reused.
4. **GST rates are editable** for each product and in Settings.
5. **Composition scheme now.** You can switch to Regular in Settings later, from a chosen date.
6. **GST rates are pre-filled** with current values (checked Nov 2026, section 10). All are editable.
7. **Daily automatic backup saved on the shop computer** and copied to Google Drive. **At most 1 day of data can ever be lost** (section 8.2).

---

## 3. Goals and success measures

| # | Goal | How we'll know it worked |
|---|------|--------------------------|
| 1 | Fast, correct billing | A normal sale takes **under 60 seconds**. Bills follow the GST checklist (section 10) |
| 2 | Exact stock | The monthly shelf count matches the app for at least 99% of serial units |
| 3 | Control udhaar | Total dues always visible. Dues older than 60 days go down month by month |
| 4 | Instant warranty answers | Warranty found in **5 seconds** from serial number or phone number |
| 5 | No missed warranty registrations | Every Exide and Amaron sale is registered with the brand **on the same day** |
| 6 | No forgotten complaints | Every complaint has a status. None stays open for more than 3 days without a follow-up |
| 7 | GST filing without a CA | Quarterly and yearly GST figures in one click |
| 8 | Papa sees the business anywhere | Weekly and monthly sales, low stock and bestsellers on his phone |
| 9 | Free and safe | ₹0 a month. A backup exists for every working day |

**Not in scope for now:** full accounting, an online store, payroll, multiple branches.

---

## 4. Design principles: simple, clean, non-technical

These rules apply to every screen. Put them in `CLAUDE.md` so every build session follows them.

1. **Everyday words, not accounting words.**

   | Technical term | What the app says |
   |----------------|-------------------|
   | Invoice | **Bill** |
   | Receivables / ledger | **Udhaar (Dues)** / **Customer account** |
   | Purchase entry / GRN | **New stock arrived** |
   | SKU / item master | **Products** |
   | Stock adjustment | **Change stock** |
   | Credit note | **Return / Refund** |
   | Payment allocation | *(hidden: the app does it automatically)* |

2. **Four big buttons on the home screen:** New Bill · Payment Received · New Stock Arrived · Warranty Check.
3. **One search box finds anything:** customer name or phone, bill number, or a battery serial number.
4. **Smart defaults, so less typing:**
   - Today's date.
   - Retail or dealer price chosen automatically from the customer type.
   - Scrap rate pre-filled at ₹105/kg.
   - Delivery charge suggestions.
5. **Confirm before anything that changes money or stock.** A plain summary popup, for example: "Save bill ₹13,710 for Sunil Kumar? Stock: Amaron 150Ah −1."
6. **Friendly messages, never error codes.**
   - "This battery (AB12345678) was already sold on bill 0123 to Sunil Kumar."
   - Not "Error 409".
7. **Hindi or English** with one tap (EN | हिं in the top bar).
8. **Calm, professional look:**
   - White background with one brand colour (deep blue).
   - **Green** for money received, **red** only for dues and warnings.
   - Large, readable numbers in Indian format: ₹1,23,456.
9. **Menu with at most 7 items:** Home · Bills · Customers · Stock · Purchases · Reports · Settings.
10. **Keyboard and barcode scanner friendly** on the counter PC, and **thumb friendly** on Papa's phone.
11. **Test with Papa every week.** Any question he asks means that screen needs to be simpler.

### Home screen (counter computer)

```
┌───────────────────────────────────────────────────────────────────┐
│  JAY ELECTRONICS                     Billing by: Staff 1 ▾  EN|हिं │
├───────────────────────────────────────────────────────────────────┤
│  🔍  Search customer, phone, bill no. or battery serial...        │
│                                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │ + NEW BILL  │ │  PAYMENT    │ │ NEW STOCK   │ │  WARRANTY   │  │
│  │             │ │  RECEIVED   │ │  ARRIVED    │ │   CHECK     │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
│                                                                   │
│  Today  ₹48,500 · 6 bills        Cash ₹18,000 · UPI ₹30,500       │
│                                                                   │
│  NEEDS ATTENTION                                                  │
│   ⚠  2 warranty registrations pending (Amaron, Exide)             │
│   ⚠  3 products running low                                       │
│   •  1 complaint waiting for brand technician                     │
│   •  Bajaj payment pending: ₹22,000                               │
│                                                                   │
│  ✓ Backup saved today, 10:02 AM                    [ Close Day ]  │
└───────────────────────────────────────────────────────────────────┘
```

### New bill screen

```
┌───────────────────────────────────────────────────────────────────┐
│  ← NEW BILL                                       Bill JE/26-27/0142 │
├───────────────────────────────────────────────────────────────────┤
│  Customer  [ 98xxxxxxxx  ]   Sunil Kumar, Chas      Retail ▾      │
│                                                                   │
│  Add item  [ Scan barcode or type: 150ah, amaron, trolley... ]    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Amaron 150Ah Tall Tubular   SN AB12345678  48m wty  ₹14,500 ✕│  │
│  │ Battery trolley                             1 ×    ₹   800 ✕│  │
│  │ Delivery & installation                            ₹   300 ✕│  │
│  └─────────────────────────────────────────────────────────────┘  │
│  [ + Old battery exchange ]     18 kg × ₹105        − ₹1,890      │
│                                                                   │
│                                      TOTAL TO PAY    ₹13,710      │
│  Paid by:  [Cash] [UPI] [Debit card] [Credit card] [Bajaj] [Udhaar] │
│            UPI ₹10,000  +  Cash ₹3,710           Balance ₹0       │
│                                                                   │
│                          [ Save & Print ]   [ Save & WhatsApp ]   │
└───────────────────────────────────────────────────────────────────┘
```

*(Prices in these sketches are only examples.)*

---

## 5. Users and logins

| Who | Can | Cannot |
|-----|-----|--------|
| **Papa (Owner)** | Everything: purchase prices, profit, reports, cancel bills, change stock counts, settings | — |
| **Staff (2)** | Bills, quotations, payments received, new stock arrived, warranty check and registration, complaints, repair job cards | See purchase prices or profit, cancel bills, change stock counts directly, change settings |
| **Pratham (Admin)** | Same as owner, plus backup and restore tools | — |

How login works:
- The **counter computer stays logged in.** Each person taps their name and enters a **6-digit PIN** to bill, so every bill shows who made it. (6 digits because the PIN is also their database password, and Supabase needs at least 6 characters.)
- Owner screens (profit, purchase prices, settings) ask for **Papa's PIN**.
- Papa logs in once on his phone, and it stays logged in.
- Settings can change who's allowed to change stock counts. By default, only the owner can.

---

## 6. Features by module

Tags: **[P1]** first version (MVP) · **[P2]** Phase 2 · **[P3]** Phase 3 · **[P4]** later ideas

### 6.1 Products

- **[P1]** Categories:
  - Inverter battery
  - Automotive battery (car, bike, truck, tractor, e-rickshaw)
  - Inverter or UPS
  - Lithium battery
  - Solar panel
  - Solar inverter or PCU
  - Charge controller
  - Stabilizer
  - Accessories (trolley, distilled water, cables, terminals)
  - **Services** (delivery and installation, charging, repair)
- **[P1]** Product fields:
  - Brand and model
  - Capacity (Ah, VA or W) and type
  - **Retail price and dealer price**, MRP, purchase price (owner only)
  - **Warranty:** free months plus pro-rata months
  - **Has serial number?**
  - Low-stock alert level
  - HSN and GST rate (under "More details", hidden from the everyday view)
- **[P1]** **Import from Excel**, using the stock list template. Bulk price updates also go through Excel, since brands change prices often.
- **[P1]** Brand settings:
  - **"Warranty registration needed at sale"**: on for Exide and Amaron
  - How to register (app, website, SMS or call) and the brand's complaint number
- **[P2]** **Combos**, for example "900VA inverter + 150Ah battery + trolley" at a combo price.

### 6.2 Stock

- **[P1]** **Serial-number stock:** each battery, inverter and panel is tracked individually, from the day it arrives to the day it's sold.
- **[P1]** **Count-based stock** for items without serials (trolleys, distilled water, cables).
- **[P1]** **Stock list** by brand and category, with low-stock highlighting.
- **[P1]** **Change stock directly**, with a reason (counted again, damaged, given free, other) and a **confirmation popup**. Every change is kept in the stock history.
- **[P1]** **Stock value** at purchase price (owner only).
- **[P2]** **Old stock alert:** batteries sitting more than 6 months (changeable) need a refresh charge. At billing, the app suggests the **oldest unit first**.
- **[P2]** **Stock count mode:** scan every serial on the shelf, and the app lists what's missing or extra.
- **[P2]** **Scrap stock:** kg of old batteries collected. Selling scrap to a recycler is recorded as kg × rate.

### 6.3 Billing

- **[P1]** **New bill** (see the sketch above and workflow 7.1):
  - Customer by phone number, items by barcode or search
  - Old battery exchange
  - Delivery and installation charge
  - Payment split
- **[P1]** **A4 Bill of Supply** (composition scheme), containing:
  - Header: shop name, address, phone, GSTIN, the words **"BILL OF SUPPLY"**, and the line *"Composition taxable person, not eligible to collect tax on supplies"*
  - Bill number, date, and who billed it
  - Customer name, phone, address, and GSTIN if they're a registered business
  - Item lines: product, **serial number**, **warranty period**, HSN (small print), quantity, rate, amount
  - Less old battery exchange
  - Plus card or finance charges
  - Total, **amount in words** (lakh/crore style), how it was paid, balance due
  - **UPI QR code with the balance amount filled in**
  - Terms (warranty by manufacturer, and so on), signature
- **[P1]** **Bill numbers:** for example `JE/26-27/0001`.
  - A new series each financial year (April–March).
  - Consecutive, and never reused.
  - The **starting number is set in Settings**, so the app can continue from the paper bill book if needed.
- **[P1]** **Save & WhatsApp:** opens WhatsApp with the customer's number and a link to their bill. The customer can view or download the PDF. This is free.
- **[P1]** **Quotations or estimates.** A quotation becomes a bill in one tap.
- **[P1]** **Cancel bill** (owner only, with a reason). Stock and dues go back automatically.
- **[P1]** **Warnings:**
  - Price above MRP
  - Price below the allowed minimum (staff don't see purchase prices)
  - Delivery address outside Jharkhand (not allowed under composition)
- **[P2]** **Returns and refunds:** partial returns, and replacing a defective item at the counter.
- **[P3]** **Tax Invoice format** for Regular GST: GST shown per item and an HSN tax summary. It switches on from Settings when needed.

### 6.4 Payments, card charges and Bajaj Finance

- **[P1]** Payment modes:
  - Cash
  - UPI
  - Debit card
  - Credit card
  - Bajaj Finance
  - Udhaar (pay later)
- **[P1]** Payments can be split ("₹10,000 UPI + ₹3,710 cash"), partial, or an advance.
- **[P1]** **Card charges:** Settings holds a default percentage for debit and for credit cards. The app adds a "Card charges" line automatically, and staff can edit it.
- **[P1]** **Bajaj Finance sale**, which records:
  - Down payment taken from the customer
  - Loan amount
  - Extra charges added to the bill
  - Bajaj reference or DO number
  - The amount then shows under **"Bajaj payments pending"** until Papa marks it received (date, amount received, any deduction).

### 6.5 Customers and udhaar

- **[P1]** Customer profile:
  - Name, **phone** (the main search), area and address
  - GSTIN (optional)
  - **Type:** Retail or Dealer (mechanic, electrician, shop)
- **[P1]** **Customer account:** every bill and payment, and the balance due.
- **[P1]** **Everything a customer has bought**, with serial numbers and warranty status.
- **[P1]** **Udhaar list:** who owes how much, oldest first.
- **[P1]** **One-tap WhatsApp reminder** with a polite message, the amount and a UPI link. This is free.
- **[P2]** Dues age groups (0–30, 31–60, 60+ days) and a credit limit warning.

### 6.6 New stock arrived (purchases) and suppliers

- **[P1]** Supplier (distributor) list with phone, GSTIN and opening balance.
- **[P1]** **New stock arrived:**
  1. Choose the supplier and enter their bill number and date.
  2. Add items with quantity and rate.
  3. **Scan each unit's serial.** The app shows a running count, for example "8 of 10 scanned", and blocks duplicates.
  4. A **confirmation popup with stock totals** appears, then save.
- **[P1]** Under composition, **GST paid to suppliers is part of the cost**, because it can't be claimed back. The app records cost including GST.
- **[P1]** Supplier account: bills, payments made, and the balance owed.
- **[P2]** Returns to supplier, and brand scheme or incentive credits.
- **[P4]** Photo of a supplier bill turned into a draft entry automatically.

### 6.7 Warranty: registration, lookup and complaints

- **[P1]** **Warranty check** by serial number, phone or bill number. It shows:
  - Sale date and warranty end date
  - Whether the unit is in the **free-replacement period, the pro-rata period, or out of warranty**
  - How many months are left
- **[P1]** **Batteries sold before the app:** add the serial and sale date from the paper register when the customer comes in.
- **[P1]** **Warranty registration tasks:**
  - After a bill with an Exide or Amaron item (or any brand that requires it), a task appears on Home: "Register warranty: Amaron 150Ah, SN AB12345678, Sunil Kumar 98xxxxxxxx".
  - Staff register it on the brand's app or website, then tick it done (with an optional reference number).
  - **Anything still pending the next day turns red.**
- **[P2]** **Complaint tracker** (brand home service):
  1. Customer reports a problem. The app shows the warranty status.
  2. Staff register the complaint with the brand and enter the **brand complaint number**.
  3. Status: Registered → Technician visited → **Repaired / Replaced / Rejected**.
  4. If replaced, link the **new serial** to the customer, so a future warranty check finds it.
  5. If there's no update after 3 days, it appears under "Needs attention". There's a one-tap WhatsApp update to the customer.
- **[P2]** **Pro-rata helper:** shows the suggested charge using each brand's rule.

### 6.8 Repair and charging (job cards)

- **[P1]** Repair, charging, and delivery and installation can be **billed as service items** from day 1.
- **[P2]** **Job cards** for items the customer leaves at the shop:
  1. Received: a job slip with a number goes to the customer on WhatsApp.
  2. Charging or under repair.
  3. **Ready:** the customer gets a WhatsApp message to collect.
  4. Delivered and billed.

### 6.9 Expenses and day close

- **[P1]** **Expenses:** rent, electricity, salary, transport, tea and snacks, and so on.
- **[P1]** **Close Day** button:
  - Shows today's summary (sales by payment mode, payments collected, expenses).
  - **Saves the evening backup.**
- **[P2]** **Cash check:** the app shows the expected cash in the drawer. Staff enter the counted cash, and any difference is noted.

### 6.10 Reports

- **[P1]** **Owner dashboard** (section 7).
- **[P1]** Bills list with filters (date, customer, payment mode) and **export to Excel**.
- **[P2]** Profit report by bill, product and brand (owner only).
- **[P2]** Old stock and slow-moving stock (no sale in 90 days).
- **[P2]** **GST helper (no CA needed):**
  - **Quarterly:** total sales and the **composition tax to pay** (1%), the figures for **CMP-08**
  - **Yearly:** the summary for **GSTR-4**
  - **Sales limit meter:** sales so far this financial year against the **₹1.5 crore composition limit**
  - Service income against its limit (section 10)

### 6.11 Reminders (bring customers back)

- **[P3]** Automatic lists, each with a one-tap free WhatsApp message:
  - **Water topping** for tubular batteries, every 3–6 months (changeable)
  - **Warranty ending soon**
  - **Battery about 4 years old:** replacement offer
  - **Dues** older than X days

### 6.12 Settings

- **[P1]** Shop details:
  - Name, address, phone, GSTIN (added later), logo
  - **UPI ID** for the QR code
  - Bill terms
- **[P1]** **GST type: Composition / Regular**, with an "applies from" date. Composition is the default.
- **[P1]** Bill number prefix and starting number.
- **[P1]** Scrap rate per kg (₹105), card charge percentages, delivery charge presets (₹200, ₹300, ₹500).
- **[P1]** Staff and PINs.
- **[P1]** **Backup folder** and backup status.

---

## 7. Owner dashboard (Papa's phone)

It opens on **This week**, with tabs for **This month** and **Custom dates**. The most important things are at the top. Scroll down for detail.

1. **Sales**
   - This week ₹X (▲ 12% vs last week)
   - This month ₹Y (vs last month)
   - Number of bills and average bill size
2. **Sales chart:** a bar for each day of the week, or each week of the month.
3. **Bestsellers:**
   - Top 5 products by units sold and by amount
   - **Sales by brand** (Amaron vs Exide vs Microtek and so on)
4. **Low stock:** products at or below their alert level, with when each last sold and a suggested order quantity.
5. **Money:**
   - How payments came in (cash, UPI, card, Bajaj, udhaar)
   - **Total udhaar** and the top 5 overdue customers
   - Bajaj payments pending
6. **Needs attention:**
   - Warranty registrations pending
   - Open complaints
   - Batteries in stock for more than 6 months
7. **Extra suggestions:**
   - **Profit this month** (owner only)
   - **Slow movers** (no sale in 90 days, money stuck in stock)
   - **Scrap collected** (kg and approximate value)
   - **Composition limit meter** (sales this financial year against ₹1.5 crore)
   - This quarter's GST to pay
8. **Share weekly report:** one tap sends a short summary on WhatsApp. This is free.

---

## 8. Free setup: tech stack and backups

### 8.1 Can it really be ₹0? Yes.

| Part | Service | Free limit | Our need |
|------|---------|-----------|----------|
| The app (website) | **Cloudflare Pages** | Free, business use allowed | Small |
| Database, logins and photos | **Supabase free plan** | 500 MB of data, 1 GB of files, 2 projects | 10 bills a day is only a few MB a year, so the space lasts for decades |
| Sharing bills | **WhatsApp click-to-chat links** | Free | — |
| Code | **GitHub** private repo | Free | — |
| Off-site backup copy | **Google Drive** | 15 GB free | Each backup is about 1–5 MB |
| Web address | `jay-electronics.pages.dev` | Free | A custom `.in` domain is optional later (about ₹800 a year) |

**The catches, and how each is handled:**

1. **Supabase pauses a free project after 7 days with no use.**
   - The shop uses it every day, so this won't normally happen.
   - If the shop is closed for more than a week, click **Restore** in the Supabase dashboard (takes a few minutes).
   - Optionally, a small free daily "ping" can keep it awake.
2. **The free plan has no built-in backups.** Our own daily backup covers this (8.2).
3. **Free plans can change their terms.** With daily backups, the data can move to another service at any time.
4. **Billing needs internet.**
   - Use a phone hotspot as a backup connection.
   - During a long outage, write a paper slip and enter the bill when the internet is back.
   - Offline billing is a Phase 4 idea.
5. Automated WhatsApp messages (sent without anyone tapping) cost money, so all WhatsApp messages are one-tap and free.

### 8.2 Daily backup (at most 1 day of data lost)

- **Automatic, twice a day:**
  1. When the app opens in the morning (yesterday's complete data)
  2. When **Close Day** is pressed in the evening (today's data)
- **Saved on the shop computer** in a folder chosen once, for example `D:\Jay Electronics Backups\`.
  - Uses Chrome or Edge, with one-time "Allow" permission.
  - **Put this folder inside Google Drive for Desktop**, so every backup is also copied off the computer for free. If the PC breaks or is stolen, the backups are safe.
- **Each backup contains:**
  1. A **complete data file** that can fully restore the app.
  2. An **Excel file** Papa can open without the app: stock list, udhaar list, and this month's bills.
- **Kept:** the last 60 daily backups, plus one per month forever.
- **Backup status on Home:** "✓ Backup saved today 10:02 AM". If a backup is missed, a **red warning** appears.
- **"Backup now" button** at any time.
- **Restore** is an admin-only tool (Pratham).
  - **Test a restore before go-live** and once a month after, because an untested backup isn't a backup.

### 8.3 Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| App | React + TypeScript + Vite, Tailwind CSS + shadcn/ui | Clean, professional components. Fast to build with Claude Code |
| Install | **PWA** (installable web app) | Works on the counter PC and Papa's Android phone, with no Play Store |
| Database and login | **Supabase** (Postgres, Auth, Storage, row-level security) | Free. Exact decimal numbers for money. Staff can't see owner-only data |
| Important actions | Database functions, such as `save_bill()` and `receive_stock()` | A bill, its stock change, the customer's dues and the payment all save **together or not at all**. No half-saved bills |
| Bill PDF and print | HTML A4 template with print styles, plus PDF download | Fast printing, and a clean PDF for WhatsApp |
| Barcode | USB scanner (types like a keyboard), with phone camera scanning as a fallback | Works with the scanner and with no extra hardware |
| Languages | `react-i18next` (English and Hindi) from day 1 | Adding Hindi later is painful |
| Testing | Vitest for money math, bill numbering and the composition report. Playwright for the bill and new-stock flows | Money mistakes are the most expensive bugs |
| Environments | **2 Supabase projects: "test" and "shop"** (live data) | Testing never touches real shop data |

---

## 9. Data model (main tables)

| Table | Holds | Key fields |
|-------|-------|-----------|
| `shop_settings` | Shop details and settings | name, address, phone, gstin, state_code (20), **gst_scheme** (composition or regular), scheme_from_date, composition_rate (1%), bill_prefix, next_bill_no, upi_id, scrap_rate_per_kg (105), debit_card_pct, credit_card_pct, delivery_presets, terms |
| `users` | People | name, role (owner, staff, admin), pin_hash, active |
| `brands` | Brands | name, **warranty_registration_required**, how_to_register, complaint_phone |
| `categories` | Groups | name |
| `products` | What's sold | brand, category, model, capacity, type, mrp, retail_price, dealer_price, min_price, purchase_price, has_serial, is_service, warranty_free_months, warranty_prorata_months, low_stock_level, hsn, gst_rate |
| `customers` | Customers | name, phone, area, address, gstin, type (retail or dealer), opening_dues |
| `suppliers` | Distributors | name, phone, gstin, opening_balance |
| `units` | **One row per serial-numbered item** | product, serial_no (unique), arrived_on, cost, status (in stock, sold, replaced, returned, damaged), sold_on, bill_item, customer, warranty_registered_at, warranty_reg_ref, source (purchase or old register) |
| `stock_history` | **Every stock change** | product, unit (if serial), change (+ or −), reason (stock arrived, sold, return, cancelled, changed by owner, damaged), linked bill or purchase, who, when |
| `purchases`, `purchase_items` | New stock arrived | supplier, supplier_bill_no, date, total; item, qty, rate, gst_paid |
| `bills`, `bill_items` | Bills and quotations | type (quotation, bill of supply, tax invoice, return), number, date, customer, billed_by, subtotal, scrap_credit, extra_charges, total, paid, balance, status (saved or cancelled), cancel_reason, share_token; line: product, unit, description, hsn, qty, rate, discount, amount, gst_rate, gst_amount (0 under composition) |
| `payments` | Money in and out | customer or supplier, bill, amount, mode (cash, upi, debit_card, credit_card, bajaj, bank), charges, reference, date, who |
| `finance_deals` | Bajaj Finance | bill, company, reference_no, down_payment, loan_amount, customer_charges, expected_amount, received_amount, received_on, status |
| `scrap` | Old batteries in and out | bill or scrap sale, kg, rate, fixed_amount, value |
| `complaints`, `complaint_updates` | Warranty complaints [P2] | unit, customer, problem, brand_complaint_no, status, result, new_unit; updates: note, date, who |
| `job_cards` | Repair and charging [P2] | customer, item, problem, estimate, status, ready_on, bill |
| `reminders` | Follow-ups [P3] | customer, unit, type, due_date, status |
| `expenses` | Shop expenses | category, amount, mode, date, note |
| `day_closes` | Close Day | date, summary, expected_cash, counted_cash, difference, backup_done |
| `change_log` | Who changed what | user, table, record, before, after, when |

**Design rules:**

1. Every stock change, including direct edits, is written to `stock_history` after the confirmation popup.
2. Saved bills are never edited or deleted, only cancelled. Cancelling reverses stock and dues automatically.
3. Nothing is permanently deleted. GST records must be kept for about 6 years.
4. **GST fields exist from day 1**, even under composition. When the shop switches to Regular, new bills simply start using them.
5. Owner-only data (purchase prices, profit) is protected at the database level, not just hidden on screen.

---

## 10. GST: composition scheme checklist

> Checked against public sources in Nov 2026. Rates and rules change, so **every rate is editable** in the app. With no CA, check unclear points on the GST portal (gst.gov.in) or with a local tax practitioner once.

**Bills**

- The bill is a **Bill of Supply**, not a tax invoice. **No GST is added or shown.**
- The top of every bill must say: ***"Composition taxable person, not eligible to collect tax on supplies"***.
- **Required details on the bill:**
  - Shop name, address and GSTIN
  - Consecutive bill number for the financial year (at most 16 characters) and the date
  - Customer name, plus GSTIN and address if they're a registered business
  - Description, **HSN code**, quantity and value
  - Signature

**Paying composition tax**

- The shop pays **1% of sales** (0.5% CGST + 0.5% SGST) from its own pocket. It can't be collected from customers.
- Filed **quarterly on CMP-08**, by the **18th of the month after each quarter**. For example, January–March is due 18 April. The app's quarterly report gives the amount.
- **Yearly GSTR-4.** The due date is now reported as 30 June (some sources still say 30 April), so confirm it on the GST portal. The app's yearly report gives the figures.

**Purchases**

- **GST paid on purchases can't be claimed back**, so the app counts it as part of the cost.

**Limits to watch**

- **Sales limit: ₹1.5 crore per financial year.** At about 10 battery bills a day, sales can approach this.
  - The **meter on the dashboard** warns at ₹1.25 crore.
  - If sales cross the limit, the shop must move to Regular GST. That's why the switch is built in.
- **No sales delivered outside Jharkhand** under composition. Counter sales to customers from other states (for example Purulia) are fine, because the sale happens at the shop. The app warns if a delivery address is outside Jharkhand.
- **Service income** (installation, repair, charging) is allowed alongside goods only up to **10% of last year's turnover or ₹5 lakh, whichever is higher**. The app tracks service income separately. Verify this limit once.
- **Scrap sold to recyclers** also counts as sales.

**Other rules**

- **MRP:** never sell above MRP. The app warns.
- **Used batteries:** under the Battery Waste Management Rules, 2022, dealers take back used batteries. The scrap record covers this.
- **E-way bill:** needed when goods worth more than **₹50,000 cross state lines**. Within Jharkhand the threshold is reportedly **₹1,00,000**. It usually affects distributor deliveries to the shop, not counter sales.

**GST rates pre-filled in the app** (used only if the shop switches to Regular, and all editable):

| Product type | HSN | Rate |
|--------------|-----|------|
| Lead-acid batteries (inverter, car, bike, e-rickshaw) | 8507 | **18%** (cut from 28% on 22 Sep 2025) |
| Lithium batteries | 8507 | 18% |
| Inverters, UPS, stabilizers | 8504 | 18% |
| Solar panels | 8541 | **5%** (cut from 12% on 22 Sep 2025) |
| Solar inverters, PCUs, charge controllers | 8504 | 5% when sold as part of a solar system, otherwise usually 18% |
| Cables, trolleys, other accessories | varies | usually 18%, set for each item |
| Services (installation, repair, charging) | 9987 | 18% |

---

## 11. Hardware

| Item | Status | Cost |
|------|--------|------|
| Counter computer with Chrome or Edge | Existing | ₹0 |
| A4 printer | Existing (assumed) | ₹0 |
| Papa's Android phone | Existing | ₹0 |
| Phone hotspot as backup internet | Existing | ₹0 |
| **USB barcode scanner** (optional) | Makes billing and stock arrival much faster | About ₹1,500–3,000, one time. **Free alternative:** type the serial or scan with a phone camera |

---

## 12. Roadmap

Part-time work with Claude Code, starting the week of 9 Nov 2026.

### Phase 1: First version (9 Nov – 20 Dec 2026)

| Week | Build |
|------|-------|
| 1 (9–15 Nov) | Project setup (repo, 2 Supabase projects, hosting, Hindi/English setup), `CLAUDE.md` with the design rules, **look and feel** (colours, buttons, layout), login and PINs, Settings |
| 2 (16–22 Nov) | **Daily backup system** (built early, so data is protected from the first day of use), brands, products, **Excel import of the stock list**, customers, suppliers |
| 3 (23–29 Nov) | **New stock arrived** with barcode scanning, the stock list, change stock with confirmation popup, stock history |
| 4 (30 Nov – 6 Dec) | **New bill screen**, A4 Bill of Supply, PDF, WhatsApp share, UPI QR, old battery exchange, delivery charges |
| 5 (7–13 Dec) | Payments (cash, UPI, cards with charges, Bajaj, udhaar), udhaar list and reminders, quotations, cancel bill, warranty check, **warranty registration tasks** |
| 6 (14–20 Dec) | **Owner dashboard**, expenses, Close Day, Hindi labels, testing, **backup restore test**, fixes from Papa's feedback |

**The first version is done when** staff can run a full day (bills, stock arrival, payments) using only the app, Papa can read the dashboard on his phone, and a backup restore has been tested.

### Go-live (21 Dec 2026 – 18 Jan 2027)

See section 13. January is a quiet month for inverters, which makes it a good time to switch.

### Phase 2 (Feb – Mar 2027)

- Complaint tracker and pro-rata helper
- Job cards for repair and charging
- Returns and refunds
- Combos
- Old stock alert and stock count mode
- Scrap sales
- Cash check at Close Day
- Profit report
- Dues age groups
- **GST helper reports.** The first CMP-08 (for January–March) is due 18 April 2027, so this must be ready by then.

**No risky changes after 1 April**, because of the summer rush.

### Phase 3 (mid-2027 onwards)

- Customer reminder lists (water topping, warranty ending, replacement)
- **Regular GST tax invoice format and reports**, ready before sales get near ₹1.5 crore
- Small improvements from daily use

### Phase 4: Ideas for later

- Offline billing
- Supplier bill photo turned into a draft entry automatically
- A public "check your warranty" page for customers
- A second shop or branch

---

## 13. Go-live plan

1. **21 Dec – 3 Jan: set up the opening data.**
   - **Shelf count:** scan every battery and inverter serial, and count the other items. This becomes the opening stock.
   - **Opening udhaar and supplier dues** from the paper register. Papa checks the totals.
   - Set the **starting bill number** in Settings.
   - Train the 2 staff in two short sessions, and put a **one-page Hindi cheat sheet** at the counter.
   - **Test a backup restore.**
2. **4 Jan 2027: real billing starts on the app.** Customers get app bills. For 2 weeks, staff also write a short line in the paper register as a safety copy.
3. **18 Jan 2027: the paper register stops.** It's kept only for internet outages.
4. **Old sales for warranty:** add serials from the paper register when customers come in. If time allows, enter the last 1–2 years of Exide and Amaron sales in advance.
5. **First month:** check in with Papa every week and fix any confusing screen quickly.

---

## 14. Running costs

| Item | Cost |
|------|------|
| App hosting (Cloudflare) | ₹0 |
| Database (Supabase free) | ₹0 |
| Backups (shop PC + Google Drive) | ₹0 |
| WhatsApp (one-tap messages) | ₹0 |
| Code (GitHub) | ₹0 |
| **Total per month** | **₹0** |
| Optional: barcode scanner (one time) | about ₹1,500–3,000 |
| Optional: custom domain | about ₹800 a year |
| Optional, later: Supabase Pro (if the free plan ever stops being enough) | about $25 a month |

---

## 15. Risks and how to handle them

| Risk | Plan |
|------|------|
| **Papa or the staff find it hard and go back to paper** | Simple screens, Hindi labels, weekly demos, a cheat sheet, and fixes for any confusing screen right away |
| Data loss | Two automatic backups a day, copied to Google Drive. Monthly restore test. Nothing is ever deleted |
| The free service changes or pauses | Backups mean data can move anywhere. Restore a paused project in a few minutes |
| Internet goes down | Phone hotspot. Paper slip, then enter the bill later |
| Sales cross the ₹1.5 crore composition limit | Dashboard meter with an early warning. The Regular GST switch is built in |
| GST mistakes without a CA | Bill format follows the section 10 checklist. Tested composition reports. Rates are editable |
| **Pratham is busy (college or exams) when something breaks** | Keep it simple and documented. No servers to look after. No risky changes in peak season. Keep an issue list |
| Staff mistakes or misuse | Personal PINs, a change history, no deleting bills, confirmation popups |
| Serial entry takes too long | Barcode scanner, plus pasting a list of serials at once |

---

## 16. Still needed from you

1. **GSTIN**, shop address, phone, logo (if any), and the terms printed on bills today.
2. **Stock list**: fill in `stock-list-template.csv` (opens in Excel).
3. **Staff names** for logins.
4. **Card charges**: the percentage for debit and for credit cards, and the usual Bajaj extra charges.
5. **Warranty registration**: how Exide and Amaron registration is done (app, website, SMS?), and whether any other brand needs it.
6. **Warranty terms** per brand or model, if they're not in the stock list.
7. **Scrap fixed amounts**: for which battery types is a fixed amount used (for example bike batteries), and how much?
8. **Shop UPI ID** for the QR code on bills.
9. **Paper bill book**: the last bill number used this financial year (to continue from), or a decision to start a new series.

---

## 17. Building it with Claude Code

- Keep this `PLAN.md` in the project. Create `CLAUDE.md` with:
  - The design principles (section 4)
  - The agreed rules (section 2)
  - The data rules (section 9)
- Build **one feature per session**, in the week-by-week order, and save (commit) after each working feature.
- Write the money and bill-number tests first.
- Keep realistic sample data (brands, products, customers) in the **test** database. Never experiment on the **shop** database.
- **Sunday demo for Papa every week.** His feedback becomes next week's list.
