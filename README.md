# VedaBloom

A mobile-first React + Vite cycle and wellbeing companion. Includes period logging, a calendar, optional symptoms, mood check-ins, non-clinical calming exercises, a private journal, support preferences, Supabase email/password authentication, and optional cloud sync.

## Privacy model in this MVP

- No health data is prefilled.
- Local-only mode is the default.
- Cloud sync is opt-in and only available after signing into an account.
- The database uses Row Level Security (RLS) so authenticated users can access only their own rows.
- Partner sharing is off by default. Period notifications require a partner account connection and explicit opt-in. Only a discreet in-app alert is sent; symptoms, flow, mood check-ins, and journal entries remain private.
- Turning cloud sync off does not delete cloud data already uploaded. Sign in and delete the cloud entries before stopping use.
- This is an early MVP, not a medical device. Do not use it to diagnose, predict ovulation, or prevent pregnancy.
- For real health data, test the app carefully and consider a security/privacy review before public launch.

## 1. Requirements

- Node.js 20+ recommended
- npm
- A Supabase project (free tier may be sufficient for a prototype; usage limits and terms can change)

## 2. Install and run locally

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell, use:
```powershell
Copy-Item .env.example .env.local
```

Create a Supabase project, then copy its Project URL and publishable/anon client key into `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Use only the public client key in the frontend. **Never use the `service_role` key in Vite, browser code, or any `VITE_` variable.**

In Supabase SQL Editor, run the complete `supabase/schema.sql` script.

Then run:
```bash
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

## 3. Supabase authentication setup

In Supabase Dashboard:
1. Open Authentication → Providers and ensure Email is enabled.
2. For a real deployment, configure the Site URL and Redirect URLs to include your deployed domain.
3. Keep email confirmation enabled for a real user-facing app.
4. Test account creation, email confirmation, sign-in and sign-out.

## 4. How cloud sync works

- The user must sign into their own account.
- Cloud sync starts OFF.
- Turning it on asks for confirmation and uploads the current local dataset to that signed-in account.
- The app reads and writes rows only for the current authenticated user, enforced by database RLS.
- Turning it off stops future sync but does not delete previously uploaded rows.
- This is a simple early implementation, not a merge engine: when sync is enabled, it replaces that account's existing dataset with the current local dataset. Do not enable sync if the account already contains important cloud data unless you intend to replace it.

## 5. Build

```bash
npm run build
npm run preview
```

## 6. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, import the repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings → Environment Variables.
5. Redeploy after adding variables.
6. In Supabase Authentication settings, set Site URL to the deployed URL and add it to allowed Redirect URLs.
7. Test on a separate account with fake data before using real sensitive data.

## 7. Partner notifications (consent-based)

1. Both people create and control their own VedaBloom accounts.
2. The person who wants to share period logs signs in, opens **Account & Privacy**, enters their partner's account email, and selects **Connect partner account**.
3. They enable **Notify partner when I log a period** and confirm the consent prompt.
4. When they save a period start, the partner can sign in and choose **Load my partner notifications** to see a discreet in-app alert.
5. The sharing person can turn the toggle off any time to stop future notifications. The partner does not get access to cycle history, flow, symptoms, mood check-ins, or journal entries.

This MVP does **not** send browser push notifications, SMS, or email. The partner must open VedaBloom and load notifications. It supports one partner connection per sharing account. Previously sent alerts remain in the recipient's account. To disconnect, remove the relevant row from `public.partner_links` in Supabase SQL Editor; a user-facing disconnect control is a production hardening item. Test with two fake accounts before using real health data. Never ask for a partner's password or link their account without their knowledge and consent.

## Troubleshooting

- If the app stays in local demo mode, check `.env.local` values and restart `npm run dev`.
- If sign-up doesn't sign in immediately, check email confirmation and the Supabase Auth logs.
- If cloud requests return permission errors, run `supabase/schema.sql` and confirm the user is signed in.
- To clear local data, use Account & Privacy → Delete local data. This does not automatically delete cloud entries.
