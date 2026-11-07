# Connecting the app to the free Supabase database

Until this is done, the app runs in **Preview mode** with sample data (nothing is saved).
Takes about 15 minutes. Everything here is free.

## 1. Create the project (you do this — needs your own sign-up)

1. Go to https://supabase.com and sign up (GitHub or email).
2. **New project** → name `jay-electronics` → set a strong database password (save it in a password manager) → region **Mumbai (ap-south-1)** → Free plan.
3. Make a second project the same way called `jay-electronics-test` (for trying things without touching real shop data).

## 2. Turn off public sign-ups

Authentication → Sign In / Providers → Email:
- **Allow new users to sign up**: OFF (only the owner adds people)
- **Confirm email**: OFF (logins use made-up emails like `owner@jay-electronics.app`)

## 3. Create the tables

Easiest: SQL Editor → New query → paste the whole of
`supabase/migrations/20261107000000_initial_schema.sql` → Run.
(Later migrations are run the same way, in filename order.)

## 4. Create the first login (the owner)

Authentication → Users → **Add user** → Create new user:
- Email: `owner@jay-electronics.app` · Password: Papa's 6-digit PIN · Auto confirm: ON

Then SQL Editor:

```sql
insert into public.people (id, name, role, login_email)
select id, 'Papa', 'owner', email from auth.users where email = 'owner@jay-electronics.app';
```

Repeat for yourself with role `admin`. Staff can be added from the app's Settings once the
"add person" server function is switched on (next step of the build).

## 5. Point the app at the database

Project Settings → API → copy **Project URL** and the **anon / publishable key**
(never the `service_role` / secret key — that one must never be in the app).

Create `.env.local` in the project folder (it is git-ignored):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... or sb_publishable_...
```

Restart `npm run dev`. The yellow "Preview mode" bar disappears and the login screen shows the
real people from the database.
