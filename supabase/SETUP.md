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

### If something goes wrong
- **"Could not connect to the database"** → check the password inside `SUPABASE_DB_URL`, and that it's the Session pooler string.
- **Project paused** (after 7 days without use) → Supabase dashboard → **Restore project**. No data is lost.
- **Start the database again from scratch** (only before go-live!) → Supabase → Project Settings → General → delete the project, create a new one, and repeat these steps.
