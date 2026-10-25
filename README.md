# Birthday Wishes

An admin web app that sends every employee a WhatsApp birthday wish at **12:00 IST** on their birthday,
through Meta's WhatsApp Cloud API.

- **Employees:** add them one by one, or import them from Excel, CSV or a text-based PDF.
- **Templates:** create message templates and send them to Meta for approval; one approved template is used for every wish.
- **Daily job:** [cron-job.org](https://cron-job.org) calls the app at noon IST. Each person is wished at most once a year, failed sends are retried, and WhatsApp reports delivered and read ticks back.
- **Dashboard:** today's and upcoming birthdays, send logs with Retry, and a health check.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, Neon Postgres and Drizzle ORM. It runs on
Netlify's free plan, or on Vercel without changes. The full requirements are in [SPEC.md](SPEC.md).

**Contents:** [Run it locally](#run-it-locally) · [Environment variables](#environment-variables) ·
[Meta WhatsApp setup](#meta-whatsapp-setup) · [Deploy to Netlify](#deploy-to-netlify) ·
[Schedule the daily job](#schedule-the-daily-job-cron-joborg) · [How sending works](#how-sending-works) ·
[Troubleshooting](#troubleshooting)

---

## Run it locally

**You need:** Node.js 22 LTS (20.19 or newer works, with an install warning from pdf.js) and a free
[Neon](https://neon.tech) Postgres database. A Neon **branch** just for development keeps test data out of
production.

```bash
npm install
cp .env.example .env.local      # then fill it in, see below
npm run hash-password           # paste the .env.local line it prints into .env.local
npm run db:migrate              # create the tables
npm run seed                    # optional: 5 sample employees, one with a birthday today
npm run dev                     # http://localhost:3000, sign in with ADMIN_EMAIL and your password
```

Then open **Settings**. Its health check shows what's connected and what isn't.

The minimum to sign in is `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`.
Without the Meta settings everything works except sending: templates are saved as drafts.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Lint, typecheck and tests (run before every commit) |
| `npm test` | Tests only (`npm run test:watch` to re-run on save) |
| `npm run build` / `npm start` | Production build and server |
| `npm run hash-password` | Bcrypt hash for `ADMIN_PASSWORD_HASH`; it asks for the password, so it never lands in shell history |
| `npm run seed` | 5 sample employees using fictional US 555 numbers. `npm run seed -- --phone 98765 43210` gives today's birthday your own number for a real test |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:studio` | Browse the database in the browser |

---

## Environment variables

Locally they go in `.env.local` (git ignores it). On Netlify they go in **Site configuration →
Environment variables**. Never commit real values or paste them into chat or tickets.

| Variable | Required for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Everything | Neon dashboard → your project → **Connect** → pooled connection string |
| `ADMIN_EMAIL` | Sign-in | The email you'll sign in with |
| `ADMIN_PASSWORD_HASH` | Sign-in | `npm run hash-password`. In `.env.local` every `$` must be written `\$` (the script prints that version); on Netlify paste the plain hash it also prints |
| `SESSION_SECRET` | Sign-in | `openssl rand -base64 48`. Changing it signs everyone out |
| `CRON_SECRET` | Daily job | `openssl rand -hex 32`. cron-job.org sends it as `Authorization: Bearer <CRON_SECRET>` |
| `META_GRAPH_VERSION` | Meta | `v26.0` (current as of October 2026; see the [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog)) |
| `META_ACCESS_TOKEN` | Meta | Permanent System User token, see [below](#4-a-permanent-access-token). The 24-hour test token works for trying things out |
| `META_PHONE_NUMBER_ID` | Meta | WhatsApp → API Setup: "Phone number ID" (not the phone number) |
| `META_WABA_ID` | Meta | WhatsApp → API Setup: "WhatsApp Business Account ID" |
| `META_APP_SECRET` | Webhook | App settings → Basic → App secret |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook | Any random string (`openssl rand -hex 16`); type the same value into Meta's webhook settings |
| `NEXT_PUBLIC_COMPANY_NAME` | Display | Shown in the app and in the default template text. **Built into the pages: redeploy after changing it** |
| `APP_TIMEZONE` | Dates | `Asia/Kolkata`. "Today", the noon schedule and all dates use it, never the server's clock |

A blank line such as `META_ACCESS_TOKEN=` counts as not set. Error messages name the missing variable,
never its value.

---

## Meta WhatsApp setup

Everything is done at [developers.facebook.com](https://developers.facebook.com) and
[business.facebook.com](https://business.facebook.com). Work through it in order.

### 1. App and business portfolio

1. Create a **business portfolio** at business.facebook.com if you don't have one, and make sure you are an
   **Admin** of it.
2. developers.facebook.com → **My Apps → Create app** → use case **Connect with customers through WhatsApp**
   → choose your business portfolio when asked.

### 2. Try it with the free test number

1. In the app: **Connect on WhatsApp → Step 1. Try it out → Claim test number**. You get a test number, its
   Phone number ID and the WhatsApp Business Account ID.
2. Under **To**, add the WhatsApp numbers you'll test with (up to 5) and verify each with the code Meta sends.
   The test number can only message these.
3. Put `META_PHONE_NUMBER_ID`, `META_WABA_ID` and a token (the 24-hour one is fine for now) in `.env.local`.
4. In the app: **Templates → New template**, submit it, and wait for approval (minutes to a day; the
   page checks each time you open it). Then click **Use for birthday wishes**.
5. Dashboard → **Send a test message** to one of your verified numbers.

If **Claim test number** fails with "An error occurred while creating the test account", see
[Troubleshooting](#troubleshooting).

### 3. Webhook (delivered and read ticks)

Needs the app deployed at a public HTTPS address (see [Deploy to Netlify](#deploy-to-netlify)).

1. Set `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` on Netlify and redeploy.
2. Meta app → **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://YOUR-SITE/api/webhooks/whatsapp` (Settings in the app shows the exact address)
   - Verify token: your `META_WEBHOOK_VERIFY_TOKEN`
3. **Verify and save**, then subscribe to the **messages** and **message_template_status_update** fields.

Every webhook is checked against your app secret (`X-Hub-Signature-256`); anything unsigned is rejected.

### 4. A permanent access token

The token from the Try it out page expires after 24 hours. For production, use a System User token:

1. business.facebook.com → **Settings → Users → System users → Add**: any name, role **Admin**.
2. **Assign assets**: your **app** (full control) and your **WhatsApp account** (full control).
3. **Generate new token** → choose your app → expiry **Never** → permissions **whatsapp_business_messaging**
   and **whatsapp_business_management**.
4. Copy it into `META_ACCESS_TOKEN` (on Netlify too) and redeploy. Settings → health check should say
   "Token works".

### 5. Going live with your own number

1. **App settings → Basic**: Privacy policy URL `https://YOUR-SITE/privacy` (the app includes this page), a
   category and an app icon. Then **Publish** the app (Live mode).
2. **Step 2. Production setup**: add your business phone number. It must not be in use on the WhatsApp or
   WhatsApp Business app. Meta also reviews its display name.
3. Add a **payment method** for the WhatsApp account. Birthday wishes use **Marketing** templates, which Meta
   charges per message delivered; see [WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing).
4. **Step 3. Business verification**: until it's done Meta limits how many people a day you can message
   (about 250). Verify before you have that many birthdays in a day.
5. Point `META_PHONE_NUMBER_ID` at the new number and create or import templates on that account.

---

## Deploy to Netlify

1. Push the repository to GitHub.
2. Netlify → **Add new site → Import an existing project** → choose the repository. `netlify.toml` sets the
   build command (`npm run build`), the publish directory (`.next`) and Node 22; Netlify adds its Next.js
   adapter automatically.
3. **Site configuration → Environment variables**: add every variable from the table above with your
   production values. For `ADMIN_PASSWORD_HASH`, paste the plain hash (no backslashes).
4. Run the migrations against the production database from your machine:
   `DATABASE_URL="<production url>" npm run db:migrate`. Do this again whenever a new file appears in
   `drizzle/`.
5. **Deploy**, sign in at `https://YOUR-SITE/admin`, and open **Settings**: every health check should be green
   except the schedule, until cron-job.org is set up.

It also deploys to Vercel as is: import the repository there and add the same variables. The app uses no
Netlify-only features (the schedule is external on purpose).

---

## Schedule the daily job (cron-job.org)

1. Sign up at [cron-job.org](https://cron-job.org) (free) → **Create cronjob**.
2. URL: `https://YOUR-SITE/api/cron/send-birthdays`
3. Schedule: **Custom**, crontab `0,10,20 12 * * *`, time zone **Asia/Kolkata**. That is 12:00, 12:10 and
   12:20 IST: the later calls retry failures and pick up anyone the first call didn't reach. Repeat calls
   never wish anyone twice.
4. **Advanced**: request method GET, add the header `Authorization` with the value `Bearer <CRON_SECRET>`.
5. Turn on failure notifications, save, and use **Test run**: the response is JSON such as
   `{"runDate":"2026-10-26","birthdaysFound":1,"sent":1,"failed":0,"skipped":0,"remaining":0,"note":null}`.

If no scheduled run happens for 26 hours, the dashboard shows a red warning. Runs started with **Run now**
don't count, so a manual run can't hide a broken schedule.

---

## How sending works

- **Who:** active employees who have agreed to WhatsApp messages, whose birthday (day and month) is today in
  IST. On 28 February in non-leap years, 29 February birthdays are wished too.
- **What:** the active approved template, with `{{1}}` replaced by the first name (titles such as Dr. or Smt
  are skipped) or the full name; choose in Settings.
- **Never twice:** a send is recorded as *queued* before anything goes to Meta, and the database allows one
  record per employee per year. Two runs at the same moment can't both claim the same person.
- **Retries:** a failed send is retried by later calls the same day, up to 3 attempts. Admins can retry from
  **Send logs**.
- **Unknown outcome:** if Meta doesn't answer (timeout or dropped connection), the message may still have
  arrived, so it is marked *Unknown* and never retried automatically. Check with the employee, then use Retry.
- **Time budget:** 5 messages at a time; no new sends start after 8 seconds, and the next call continues.
- **Ticks:** the webhook moves each send forward to sent, delivered, read or failed, never backwards.
- **Test messages** from the dashboard use the active template and aren't recorded as anyone's birthday wish.

### Importing employees

Import accepts `.xlsx`, `.xls`, `.csv` and text-based `.pdf` files up to 5 MB, read in the browser; only the
rows you import are sent to the server, 500 at a time. Columns are matched by heading (Name, Phone or
Mobile or WhatsApp, DOB or Date of Birth, Emp Code or ID, Consent), and can be re-matched by hand. Dates
can be Excel dates, DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YYYY or YYYY-MM-DD; ambiguous ones are read day first.
**Download a sample CSV** on the Import page shows the layout, and an **Export CSV** from Employees can be
imported back as is.

"Add new and update existing" matches people by employee code, then by phone. Blank consent or code cells
keep what's saved.

---

## Project layout

```text
src/app/admin/          admin pages (dashboard, employees, import, templates, logs, settings) and their Server Actions
src/app/api/            export, import, the daily job (cron) and the WhatsApp webhook
src/app/privacy/        the public privacy policy
src/lib/                business logic; pure modules (dates, phone, import, birthday-run…) are unit-tested
src/lib/meta/           Meta Graph API calls over fetch (no SDK)
src/db/                 Drizzle schema and database client; migrations are in drizzle/
tests/                  Vitest tests
scripts/                hash-password and seed
```

---

## Security

- One admin, from environment variables. Passwords are bcrypt-hashed. Sessions are signed JWTs in an
  httpOnly, SameSite=Lax cookie (Secure in production) that lasts 7 days. Sign-in is blocked for 15 minutes
  after 5 failed attempts from one IP.
- Every admin page, Server Action and admin API checks the session itself, not only the proxy in front.
- The daily job needs `CRON_SECRET`, compared in constant time; the webhook needs Meta's HMAC signature.
- Tokens and secrets are never logged or sent to the browser. Logs contain counts, not names or phone
  numbers (phones are masked where they appear).
- Employee exports guard against spreadsheet formula injection.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Settings: "tables are missing" | Run `npm run db:migrate` against that `DATABASE_URL` |
| Can't sign in locally though the password is right | In `.env.local` every `$` in `ADMIN_PASSWORD_HASH` must be `\$`. Use the line `npm run hash-password` prints |
| "Something went wrong" on every admin page | An environment variable is missing or invalid; the server log names it |
| "The Meta access token is invalid or has expired" | The 24-hour test token expired; create a [permanent token](#4-a-permanent-access-token) |
| Meta error 131030 "Recipient phone number not in allowed list" | The test number only messages verified numbers: add yours under **To** on the Try it out page |
| Meta error 132001 "Template name does not exist" | The active template is missing on this WhatsApp account or in this language; refresh Templates or choose another |
| "Claim test number" fails with "An error occurred while creating the test account" | Usually an account restriction: check [Business Support Home](https://business.facebook.com/business-support-home), turn off browser privacy blockers, and make sure you're an Admin of the business portfolio. Otherwise report it to [Meta developer support](https://developers.facebook.com/support/bugs/) |
| Dashboard: "No scheduled run…" | cron-job.org isn't calling, or gets a 401 because the `Authorization` header doesn't match `CRON_SECRET` |
| Sends show **Unknown** | Meta didn't answer in time. Check with the employee, then Retry from Send logs if the message didn't arrive |
| Company name didn't change | `NEXT_PUBLIC_COMPANY_NAME` is built into the pages: redeploy |
| Phone numbers look like `9.19E+11` after editing an export in Excel | Excel rounds long numbers. Format the phone column as Text, or use the downloaded file as is |
