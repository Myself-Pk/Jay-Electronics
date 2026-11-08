# Connecting the app to the free Supabase database

Until this is done, the app runs in **Preview mode** with sample data saved only in your browser.
About 15 minutes, once. Everything here is free.

## 1. Create the project (you)

1. Go to https://supabase.com → **Start your project** → **Continue with GitHub** (use the Myself-Pk account).
2. **New project**:
   - Name: `jay-electronics`
   - Database password: click **Generate a password**, then **save it in your password manager** — you need it in step 3.
   - Region: **South Asia (Mumbai)**
   - Plan: Free. Leave the other options as they are.
3. Wait about 2 minutes while it starts.
4. Recommended: your account (top-right) → **Security** → turn on two-factor login.

## 2. Only allow logins the shop creates (you)

Authentication → **Sign In / Providers** → turn **Allow new users to sign up** OFF → Save.
(People are added with `npm run add-person`, never by signing up.)

## 3. Fill in `.env.local` (you)

Open `.env.local` in the project folder and paste the 4 values it asks for:

| In `.env.local` | Where in Supabase |
|---|---|
| `VITE_SUPABASE_URL` | Project Settings → Data API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API Keys → Publishable key |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret key (reveal) |
| `SUPABASE_DB_URL` | **Connect** (top of the page) → **Session pooler** → URI, with `[YOUR-PASSWORD]` replaced |

Use the **Session pooler** string, not "Direct connection": the direct one needs IPv6, which most Indian home and shop internet doesn't have.

Never paste the secret key or the database password into chat, GitHub or the app's Settings.

## 4. Create the tables (Claude or you)

```bash
npm run db:migrate
```

Run it again any time new features add database changes — it only applies what's new.

## 5. Add the people who log in (you, in your own terminal)

```bash
npm run add-person
```

It asks for the name, what they can do (owner / staff / admin) and a 6-digit PIN (hidden while typing).
Run it once for Papa (owner) and once for yourself (admin). Staff can be added the same way.

## 6. Start the app

Restart `npm run dev`. The yellow "Preview mode" bar disappears and the login screen shows the real people.

---

## 7. Switch on automatic backups (once, on the shop computer)

The free Supabase plan has no backups of its own, so the shop computer keeps them:

```bash
npm run backup:schedule
```

This adds a hidden Windows task that checks every hour and takes **one backup a day**: after 7 PM, or as soon
as the computer is switched on if the last backup is more than a day old. At most one day of data can be lost. Backups go to the `backups` folder in the project — or set
`BACKUP_DIR=G:\My Drive\Jay Electronics Backups` in `.env.local` so Google Drive keeps a copy off the computer.
Each backup folder also has `stock.csv`, `dues.csv` and `bills-this-month.csv`, which open in Excel.

**To restore** (only if the database is lost): new Supabase project → steps 1–4 → `npm run restore -- "<backup folder>"`.
Logins come back with temporary PINs, printed on screen.

## 8. Put the app online and on the phone

The app is hosted free on **Cloudflare Pages**, so it opens on any phone and customers' WhatsApp bill links work.

```bash
npm run deploy
```

This builds the app and uploads it (the first time, `npx wrangler login` opens Cloudflare in the browser).
Only the publishable key goes online — the secret key and database password stay in `.env.local`.
Put the address in `.env.local` as `VITE_PUBLIC_URL=https://….pages.dev` so bills shared from the shop computer link there.

**On the Android phone:** open the address in Chrome → log in → tap **Install app** (top bar). It gets an icon and opens full screen.
**As an APK:** the `android/` folder (not in git) has the APK made with PWABuilder from the live address, and
`public/.well-known/assetlinks.json` proves the APK belongs to the site (so it opens without a browser bar).
The APK only shows the live site, so app updates need just `npm run deploy` — no new APK.
Keep the signing key and its passwords from PWABuilder safe (e.g. a copy on Google Drive) and **never put them on GitHub**:
the same key is needed if the APK itself ever has to be rebuilt.

### If something goes wrong
- **"Could not connect to the database"** → check the password inside `SUPABASE_DB_URL`, and that it's the Session pooler string.
- **Project paused** (after 7 days without use) → Supabase dashboard → **Restore project**. No data is lost.
- **Start the database again from scratch** (only before go-live!) → Supabase → Project Settings → General → delete the project, create a new one, and repeat these steps.
