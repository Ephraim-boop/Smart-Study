# StudySmart — Subscription / Pricing / Payment-Verification Module

Self-contained module implementing **Sections 3, 6, 7, 8, 9 and 12** of the
StudySmart brief: country-specific monthly pricing, Orange Money manual-payment
instructions, premium access gating, and administrator payment verification —
with the database schema and security rules.

> The project uses Node.js 20+ and npm. Install dependencies with `npm install`,
> then validate with `npm run typecheck` and `npm run build`.

---

## What is included

```
src/subscription/
  config/countries.ts            Country defaults: currency, language, recipient, price
  types/subscription.ts          Shared TS types (statuses, records, settings)
  lib/supabaseClient.ts          Env-driven Supabase client (anon key only)
  lib/subscriptionApi.ts         All reads + privileged RPCs
  lib/accessControl.ts           Premium feature catalog + frontend gate helper
  hooks/useSubscription.ts       Live subscription state + submit/renew
  hooks/usePremiumAccess.ts      Per-feature unlock check
  components/                    PricingPage, SubscribePage, PaymentInstructions,
                                 SubscribeForm, PlanCard, PremiumLock,
                                 SubscriptionStatusBadge, DashboardSubscriptionCard
  components/admin/              PendingPaymentsTable, PriceSettingsEditor
  index.ts                       Public barrel
supabase/
  migrations/0001_subscription_schema.sql     Tables, enums, indexes, triggers
  migrations/0002_subscription_functions.sql  RPCs: submit/verify/reject/upsert settings
  migrations/0003_subscription_rls.sql        Row-level security + grants
  seed.sql                                    Default prices (GN 20,000 GNF, SL 20 SLE)
.env.example
package.json / tsconfig.json / vite.config.ts / tailwind / postcss
```

---

## Setup

### Deploy the website to Netlify

The frontend is a Vite single-page app. `netlify.toml` configures the production
build (`npm run build`), publishes `dist`, and rewrites direct page requests to
`index.html` so refreshes work.

1. Push this repository's `main` branch to GitHub and in Netlify choose
   **Add new site → Import an existing project → GitHub**. Select
   `Ephraim-boop/Smart-Study`; keep the build command and publish directory
   detected from `netlify.toml`.
2. In the Netlify site settings, add these environment variables for the
   **Deploy context: All**:
   - `VITE_SUPABASE_URL` — the Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` — the Supabase public anon/publishable key.
3. Do not set `VITE_SUMMARIZE_ENDPOINT` on Netlify. When it is unset, the
   frontend calls the authenticated Supabase Edge Functions; the local
   `.env` value pointing to `localhost:8787` is ignored by Git and must not be
   copied into production.
4. Configure Supabase Authentication's **Site URL** and allowed **Redirect
   URLs** to include the Netlify site URL (for example
   `https://your-site.netlify.app/**`).
5. Apply the database migrations in Step 2 and deploy the Edge Functions in
   **Option B** below. Set AI provider keys as Supabase function secrets, never
   as `VITE_` variables or in Netlify's frontend environment.
6. Trigger a Netlify deploy. Afterward test sign-in/email confirmation, refresh
   a nested page, upload a note, and invoke each AI feature.

### Step 1 — Install the toolchain (needed for everything below)
1. Install **Node.js 20+** (https://nodejs.org). This module assumes npm is on
   your PATH.
2. From the project root run:
   ```
   npm install
   npm run typecheck     # should pass with zero errors once deps are installed
   ```

### Step 2 — Provision the backend (Supabase)
1. Create a Supabase project (or point at your existing Postgres).
2. In the **Dashboard → SQL Editor**, run **every** file below, **in order**, one
   at a time. They are all idempotent, so re-running one after a change is safe.
   **Nothing in this app works partially configured: if a file has not been run,
   its feature fails with a visible 404/400 in the browser console.**
   - `supabase/migrations/0001_subscription_schema.sql`
   - `supabase/migrations/0002_subscription_functions.sql`
   - `supabase/migrations/0003_subscription_rls.sql`
   - `supabase/migrations/0007_auth_profiles.sql` (private `profiles` row per student + auto-create trigger)
   - `supabase/migrations/0008_note_storage.sql` (private `student-notes` Storage bucket + per-student policies)
   - `supabase/migrations/0009_study_notes.sql` (private saved study notes)
   - `supabase/migrations/0010_assignment_chats.sql` (private assignment chat history)
   - `supabase/seed.sql`
   (Or use the CLI: `supabase db push` after copying migrations into
   `supabase/migrations`.)
3. **Check they were really applied** (SQL Editor, one query at a time):
   ```sql
   select count(*) from public.profiles;                      -- must NOT error
   select count(*) from public.assignment_chats;              -- must NOT error
   select id from storage.buckets where id = 'student-notes'; -- must return 1 row
   ```
   A `relation "public.profiles" does not exist` error means step 2 was skipped —
   every sign-in will then log a 404 against `/rest/v1/profiles`.
4. If your app already has its own `public.profiles` table with an id + country
   column, the module reuses it. Otherwise migration 0002 creates a minimal one;
   make sure each student's `profiles.country` is set to `'GN'` or `'SL'` at
   registration — `submit_payment` reads the country **server-side** from there.

### Step 3 — Credentials
1. Copy `.env.example` → `.env`.
2. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
   Project Settings → API. **Never** place the `service_role` key in any
   client-readable env; privileged actions run as the DB owner via the RPCs.

### Step 4 — Create administrators
Premium is only ever granted by `admin_verify_payment`, which requires an admin.
`public.is_admin()` reads `app_metadata.role === 'admin'` from the JWT. Set it
for authorized staff, e.g. in the Supabase dashboard (Authentication → Users →
User Metadata / app_metadata) or via:
```sql
update auth.users
   set raw_app_metadata = jsonb_set(raw_app_metadata, '{role}', '"admin"')
 where id = 'ADMIN-USER-UUID';
```
Ordinary students can never approve their own subscriptions.

### Step 5 — Wire into the app (integration points)
```tsx
import {
  useSubscription, PricingPage, SubscribePage,
  DashboardSubscriptionCard, PremiumLock,
} from './src/subscription';

// Student area
const subscription = useSubscription();
<PricingPage country={userCountry} onSubscribe={goToSubscribe} />
<SubscribePage country={userCountry} subscription={subscription} />
<DashboardSubscriptionCard subscription={subscription} country={userCountry} onSubscribe={goToSubscribe} />

// Guard any premium tool (UI hint only — also enforce server-side)
<PremiumLock access={subscription.access} feature="mock_examination" onSubscribe={goToSubscribe}>
  <MockExam />
</PremiumLock>

// Admin dashboard (render only for is_admin users)
<PendingPaymentsTable />
<PriceSettingsEditor />
```
Add Tailwind directives to your global CSS (e.g. `@tailwind base;` …) and include
`src/subscription/**/*.{ts,tsx}` in `tailwind.config.js` content (already set).

### Step 6 — Enable real Authentication (email + password)
The app is **gated behind Supabase Auth** — no features are visible until a
student is signed in. It uses **only** real Supabase Auth: there is no demo /
browser-only fallback, so if this step is incomplete the app shows a "not
configured" screen rather than a fake login.

1. Run `supabase/migrations/0007_auth_profiles.sql` (after 0001–0003). It gives
   `public.profiles` a private row per user (`id = auth.users.id`, auto-created
   by the `handle_new_user` trigger) with **RLS so each user sees/edits only
   their own profile**.
2. Supabase dashboard → **Authentication → Providers → Email**: enable it.
   Keep **"Confirm email" ON** to require email verification.
3. **Authentication → URL Configuration**: set **Site URL** to your app origin
   (e.g. `http://localhost:5173` in dev, your domain in prod) and add the same
   origin to **Redirect URLs** — used by the confirmation and password-reset
   links.
4. (Production) configure **SMTP** under Authentication so emails actually send.
5. Sign up with a real address, click the confirmation link, then log in. Use
   **Forgot password?** on the login screen to test the secure reset flow (the
   link returns to the app and opens a "choose a new password" form).

Handled for you: duplicate email, invalid credentials, unverified email, weak
password, rate-limiting, and network errors each show a clear message. Sessions
persist and auto-refresh; **Log out** (navbar) ends them.

#### Testing authentication once configured
- Sign up → "Confirm your email" screen appears → link confirms the account →
  log in reveals the app.
- Log in with wrong password → "Incorrect email or password."
- Log in before confirming → "Please confirm your email address…" + resend.
- Forgot password → email link → set new password → signed in.
- A second user cannot read the first user's profile (RLS returns no row).

---

## Smart Summarize (AI summaries of uploaded notes)

Smart Summarize reuses the **existing upload feature** — the notes a student
uploads are summarized directly, without uploading again. It is wired to a
**real AI model through a secure backend** (a local dev server or a Supabase
Edge Function); the API key lives **only on the server**, never in the browser.
The student's own sign-in token is sent with every request and the backend
verifies it before spending any AI quota, so an anonymous or expired session is
refused with a message that says so.

**What works today (no extra setup):** the UI, the post-upload prompt, file
selection, PDF / Word `.docx` / text extraction, and all result actions (Copy /
Download / Print / Review Key Topics / Save). Without an AI key the app shows an
honest "not connected" message naming that cause instead of a fake summary.

**Supported inputs:** PDF with selectable text, Word `.docx`, plain text
(`.txt`/`.md`). Photos, camera captures and scanned image-only PDFs need OCR and
are reported clearly ("contains no selectable text (likely a scanned document)")
— never guessed, never summarized as if they had been read.

**Where an upload is kept:** every note is written to this browser's IndexedDB
vault (so it survives a refresh, a logout and a re-login) **and** attempted in the
student's private folder inside the `student-notes` Storage bucket
(`student-notes/<their user id>/…`), and the cloud copy is only claimed after it
has been read back and its size checked. If the bucket has not been created yet
(Step 2 above), the app keeps the device copy and says exactly why instead of
failing silently.

### Enable real AI summaries

You need a real AI API key (this is the only thing the app cannot do for you).
**Google Gemini offers a free key with no credit card** — recommended.

**Option A — Local backend (recommended, and the default):**
1. Get a key: Gemini at https://aistudio.google.com ("Get API key"), or OpenAI
   at https://platform.openai.com.
2. Put it in `server/.env`:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   ```
3. Start everything with **one command**:
   ```
   npm run dev
   ```
   `scripts/dev.mjs` starts the AI backend **and** Vite together, waits for
   `/health`, prints `✓ AI backend started (provider gemini, key configured)`,
   reuses a backend that is already running, and restarts the backend if it dies.
   The browser then talks to `/ai/…`, which Vite proxies to the backend — so the
   key, the port and CORS never appear in the browser. Restart `npm run dev`
   after changing the key (the backend reads it only at startup).
   - Other devices on your network (a student's phone on the same Wi-Fi) can use
     the whole feature with `npm run dev:lan`, then opening the printed
     `Network:` address. This is the supported way to let a second person test it.
   - `npm run summarize` still exists to start only the backend, and
     `npm run dev:web` only Vite.
   - A static host (Netlify/Vercel/`dist/` on any web server) cannot reach a
     `localhost:8787` backend: on that machine it works, everywhere else it does
     not. For hosting, use Option B or point `VITE_SUMMARIZE_ENDPOINT` at a
     real HTTPS URL of the backend.

**Option B — Supabase Edge Function (production):**
1. Install the Supabase CLI (https://supabase.com/docs/guides/cli) and log in:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
2. Deploy the functions and store the key as a server secret:
   ```
   supabase functions deploy summarize-notes
   supabase functions deploy generate-questions
   supabase functions deploy grade-answer
   supabase functions deploy generate-flashcards
   supabase functions deploy solve-assignment
   supabase secrets set OPENAI_API_KEY=sk-...
   ```
3. Remove the `VITE_SUMMARIZE_ENDPOINT` line from `.env` so the app calls the
   Edge Functions instead of the local server.

Finally, reload the app, upload a note, select it, choose a length and a language
and click **Summarize selected**. A structured summary (main summary, key points,
definitions, facts, topics, revision tips) is generated from the actual notes.

The Assignment Solver uses the same server-side AI secrets. The local backend
serves its conversational chat through `/solve-assignment`; production uses the
`solve-assignment` Edge Function. It accepts document text and up to four JPG,
PNG or WEBP images per message (3 MB combined). Conversation history is stored
in the private `assignment_chats` table with row-level security and mirrored on
the device. Apply migration `0010_assignment_chats.sql` to enable account sync;
until then the UI warns that history is device-only. Uploaded image bytes are
not stored in chat history.

> The backend verifies the caller and keeps the key server-side. If no key is set
> it returns `AI_NOT_CONFIGURED` and the UI shows that — it never fabricates a
> summary, and never reports success unless real summary content came back.


### When a summary fails, the message names the cause

Each failure has its own sentence in English and French — there is no single
catch-all any more. What each one means and who fixes it:

| The app says | Actual cause | Fix |
| --- | --- | --- |
| "The AI service on this computer is not running." | backend process is down | `npm run dev` |
| "… not connected to an AI model yet …" | `server/.env` key missing/blank | add the key, restart |
| "Your sign-in is no longer valid." | expired session / token rejected | log in again |
| "We could not confirm your sign-in right now." | backend could not reach Supabase Auth | check internet / project status |
| "There was no readable text in those notes …" | empty, scanned or image-only document | upload a text PDF, `.docx` or `.txt` |
| "That file type cannot be read yet." | unsupported format | PDF / `.docx` / `.txt` / `.md` |
| "Those notes are too large to summarize in one request." | too much text at once | select fewer notes |
| "The AI service took too long to answer, so we stopped." | 60 s server budget / 75 s browser budget exceeded | retry, or select fewer notes |
| "The AI service is busy right now." | provider 429 or 6 concurrent generations | wait a moment, retry |
| "The AI service has used up its quota for now." | provider account quota | top up / wait for the reset |
| "The AI model is temporarily unavailable." | provider 5xx | retry (the backend already tries the fallback models) |
| "The AI returned a response we could not read." | malformed model output | retry |
| "This computer could not reach the AI provider." | backend has no internet | fix that machine's connection |

The backend logs the real technical cause with a request id
(`[req …] /summarize failed code=… …`) — including the upstream HTTP status and
message — which is what to quote when reporting a problem. Nothing it logs can
contain the API key: the caller token is stored only as a truncated SHA-256 hash.

### Test checklist for Smart Summarize (with a brand-new student account)
A new account needs **nothing** manual: no admin role, no profile editing, no
extra settings. If any of these fails, the setup above is incomplete:
1. Sign up → confirm by email → log in.
2. Upload `test-fixtures/Biology 101 notes.pdf` → it appears under Your uploads.
3. Smart Summarize → the note is listed as "Ready to summarize" and pre-selected.
4. Length Medium, Language English → **Summarize selected** → a real summary.
5. Refresh → the note and the saved summary are still there.
6. Log out, log in → still there. Sign up as a **second** student → the first
   student's notes and summaries must not be listed.
7. Upload `test-fixtures/History notes.docx`, Language French → a French summary.

---

## How it satisfies the pricing & payment requirements

- **Prices**: Guinea **20,000 GNF/month**, Sierra Leone **20 SLE/month** are
  seeded into `subscription_settings` and remain **configurable in the admin
  dashboard**; the student UI reads them at runtime (never hardcoded).
- **Currency confirmation (SL)**: `SLE` is stored as a configurable field, so the
  owner can correct the denomination from the admin UI without code changes. A
  note on the 2022 redenomination is in `config/countries.ts`.
- **Country-based instructions**: `PaymentInstructions` shows each country's
  Orange Money recipient **only** to that country's students
  (`+22461132905` / `+232079960361`).
- **Register free / premium locked**: `useSubscription` + `PremiumLock` gate
  premium; free access is the default state.
- **No auto-activation from screenshots/refs**: `submit_payment` only creates a
  `pending_verification` record. Premium turns on **only** in
  `admin_verify_payment`.
- **30-day activation + dates shown**: verification sets `activation_date` and
  `expiry_date` (from `period_days`); the dashboard displays both + days left.
- **Manual renewal, no auto-deduction**: renew = submit a new verified payment;
  renewing while active extends from the current expiry.
- **Backend enforcement**: state changes happen only in `SECURITY DEFINER`
  functions with role checks; RLS stops cross-student data access.
- **Duplicate prevention + audit log**: unique transaction reference; every
  verify/reject is written to `payment_verification_logs`.
- **Expiry keeps account & work**: rows are never deleted on expiry; status
  returns to `expired`/free with a renew option.

---

## Things that still need your decision / are intentionally deferred

- **Real Orange Money API**: this is a **manual verification** workflow, per the
  brief. There is **no** automatic transaction confirmation — do not claim one
  until an official Orange Money API is integrated and tested.
- **Confirm the SLE amount** with the payment provider (fees/viability) before
  launch, as the brief requires.
- **Registration/profiles, free-feature usage limits, file uploads, AI features**
  live outside this module — integrate them with your existing app.
- **Notifications** after activation/rejection: hook `admin_verify_payment` /
  `admin_reject_payment` to your email/SMS provider.

## Test checklist (per Section 14)
- Free user sees premium locked; cannot call verify RPCs.
- Student submits reference → status `pending_verification` (premium still locked).
- Admin verifies → `active`, expiry = +30 days, dashboard shows dates.
- Re-submitting the same reference → `DUPLICATE_REFERENCE` error.
- Non-admin calling `admin_verify_payment` → `FORBIDDEN`.
- After expiry → status `expired`, saved work intact, renew offered.
