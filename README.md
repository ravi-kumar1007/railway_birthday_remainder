# Birthday Wishes

Admin app that sends employees a WhatsApp birthday wish every day at 12:00 IST through the
Meta WhatsApp Cloud API. See [SPEC.md](SPEC.md) for the full specification.

> Full setup, Netlify deploy, cron-job.org and Meta checklist arrive in Phase 7.

## Run locally

Requires Node.js 20.9+ (22 LTS recommended) and a free [Neon](https://neon.tech) Postgres database.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | How to get it |
| --- | --- |
| `DATABASE_URL` | Neon dashboard → Connect → pooled connection string |
| `ADMIN_EMAIL` | The email you will sign in with |
| `ADMIN_PASSWORD_HASH` | `npm run hash-password`, then paste the `.env.local` line it prints (with `\$`) |
| `SESSION_SECRET` | `openssl rand -base64 48` |

The other variables are not needed until later phases.

```bash
npm run db:migrate   # create the tables in Neon
npm run dev          # http://localhost:3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Lint + typecheck + tests |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:studio` | Browse the database |
| `npm run hash-password` | Bcrypt hash for `ADMIN_PASSWORD_HASH` |
