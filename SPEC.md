# SPEC: Employee Birthday WhatsApp Automation

## Goal
Admin web app. Store employees (name, phone, birthday). Import from Excel/CSV/PDF
or add manually. Admin manages WhatsApp templates. Every day at 12:00 IST, send a
WhatsApp birthday wish to each employee whose birthday is today, via Meta WhatsApp
Cloud API. Never add a paid service without asking me.

## Tech stack (do not change without asking)
- Next.js (latest stable, App Router) + TypeScript + Tailwind CSS
- Neon Postgres + Drizzle ORM + @neondatabase/serverless (HTTP) + drizzle-kit migrations
- Host: Netlify free plan. No platform-specific APIs (must also run on Vercel).
- Scheduler: external cron-job.org calling a secured API route. No platform cron.
- WhatsApp: Meta Cloud API (Graph API) via fetch. No SDK, no third-party BSP.
- File parsing in the BROWSER: SheetJS (install from official SheetJS CDN tarball,
  not outdated npm version), PapaParse, pdfjs-dist.
- zod validation. Auth: jose (JWT, httpOnly cookie) + bcryptjs.
- Always compute "today" in Asia/Kolkata, never server local time.

## Environment variables (.env.example)
DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH (add `npm run hash-password` script),
SESSION_SECRET, CRON_SECRET, META_GRAPH_VERSION (current version from Meta docs),
META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_WABA_ID, META_APP_SECRET,
META_WEBHOOK_VERIFY_TOKEN, NEXT_PUBLIC_COMPANY_NAME, APP_TIMEZONE=Asia/Kolkata

## Database
employees: id uuid, emp_code text unique nullable, name, phone (E.164, unique),
  birth_day int, birth_month int, birth_year int nullable, whatsapp_consent bool
  default false, is_active bool default true, timestamps. Index (birth_month, birth_day).
templates: id, name (Meta format: lowercase_underscores), language default 'en',
  body_text ({{1}} = employee name), example_value, category 'MARKETING',
  meta_template_id, status (DRAFT|PENDING|APPROVED|REJECTED|PAUSED|DISABLED),
  rejection_reason, is_active (only one true), timestamps.
send_logs: id, employee_id FK, send_year int, template_id FK,
  status (queued|sent|delivered|read|failed), wa_message_id unique nullable,
  error_code, error_message, attempts int, timestamps. UNIQUE(employee_id, send_year).
cron_runs: id, started_at, finished_at, run_date, birthdays_found, sent_count,
  failed_count, skipped_count, note.
login_attempts: ip, attempted_at, success.
settings: key/value (e.g. name_format = first|full).

## Features
### Auth
- /login. Single admin from env. JWT cookie (httpOnly, secure, sameSite=lax, 7 days).
- Middleware protects /admin/* and /api/admin/*.
- Block login 15 min after 5 failed attempts per IP.

### Employees (/admin/employees)
- Table: search, filters (active, consent), pagination.
- Add/edit/soft-delete. Phone: accept 10-digit Indian numbers, auto-prefix +91, validate.
- Birthday date picker, optional emp code, consent checkbox.
- "Export CSV" button (backup).

### Import (/admin/import)
- Accept .xlsx .xls .csv .pdf (max 5 MB). Parse in browser.
- Auto-detect columns by header (Name/Employee Name; Phone/Mobile/WhatsApp;
  DOB/Birthday/Date of Birth; Emp Code/ID; Consent). Manual column re-mapping UI.
- Dates: Excel serial, DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YYYY, YYYY-MM-DD.
  Ambiguous = DD/MM (Indian). Show parsed date in preview.
- PDF: text-based only. Regex row detection (name + phone + date). If none found:
  "Scanned PDF not supported. Upload Excel/CSV."
- Preview table: valid / error (reason) / duplicate per row.
- Modes: "Add new + update existing (match emp_code, else phone)" or "Add new only".
- POST valid rows as JSON in chunks of 500 to /api/admin/employees/import.
  Server re-validates (zod), upserts in transaction, returns inserted/updated/skipped.
- Downloadable sample CSV with correct headers.

### Templates (/admin/templates)
- Create: name, language, body with {{1}}, example value. Category fixed MARKETING.
- Save -> POST /{WABA_ID}/message_templates; store meta id, status PENDING.
- "Refresh status" button + refresh on page load (GET from Meta).
- "Import existing templates from Meta" button.
- Set one APPROVED template active. Live preview with sample name. Delete (Meta + DB).

### Daily job: /api/cron/send-birthdays (GET and POST)
- Require header Authorization: Bearer CRON_SECRET, else 401.
1. Today in Asia/Kolkata.
2. Active + consented employees matching (month, day). Feb 29 -> Feb 28 in non-leap years.
3. Skip if send_log exists this year with sent/delivered/read.
4. No active APPROVED template -> log cron_run note, return.
5. Insert send_log 'queued' BEFORE sending (idempotency). POST
   /{PHONE_NUMBER_ID}/messages, template type, body param = name per name_format setting.
6. Concurrency 5. Stop starting new sends after 8 seconds; return {remaining}.
   Multiple calls per day must NEVER double-send.
7. Save wa_message_id + 'sent', or 'failed' with Meta error. Retry failed (attempts < 3)
   on later calls same day.
8. Write cron_runs row.
- Admin buttons: "Run now", "Send test message to phone X" (not logged as birthday).

### Webhook: /api/webhooks/whatsapp
- GET: verify hub.mode, hub.verify_token, return hub.challenge.
- POST: verify X-Hub-Signature-256 HMAC (META_APP_SECRET, raw body). Update send_logs
  by wa_message_id for sent/delivered/read/failed. Respond 200 fast.

### Dashboard (/admin)
- Total employees, birthdays today, next 30 days, last cron run + result
  (red warning if no run in 26 hours), failed sends this month.
- Logs page: filters (date, status), "Retry" on failed.

### Settings (/admin/settings)
- Health check: DB connected, Meta token valid, active template exists.
- name_format setting.

### Public
- /privacy: simple privacy policy (required for Meta app Live mode).

## Non-functional
- Clean, mobile-friendly admin UI.
- Never log tokens. Mask phone numbers in logs.
- Seed script: 5 fake employees, one with birthday today.
- Vitest tests: date parsing, phone normalization, Feb 29, IST today, idempotency.
- README: setup, env, migrations, Netlify deploy, cron-job.org, Meta checklist.

## Phases. After each: lint + typecheck + tests, summarize, STOP for my "continue".
1. Setup, schema, migrations, auth, layout.
2. Employees CRUD + CSV export.
3. Import (Excel/CSV/PDF) + preview + sample file.
4. Templates + Meta API.
5. Cron job + run now + test send.
6. Webhook + dashboard + logs + settings + privacy page.
7. README, tests, netlify.toml, final security review.
