# Kherani Lab — Instrument Booking System

A web-based reservation platform for shared research instruments in the Kherani Lab. The v1 pilot
covers a single instrument, the **Raman Spectrometer** at TBEP (661 University Avenue, 14th Floor,
Toronto), and is designed to expand to additional instruments later.

It replaces informal scheduling with an access-controlled booking tool: a calendar, server-side
conflict prevention, per-instrument and per-user rules, Raman session sign-in/out with laser and
photon-count logging, a waitlist, and admin usage exports.

## Tech stack

- **Next.js 15** (App Router, Server Actions) + **TypeScript**
- **PostgreSQL** + **Prisma** (overlap prevention via a GiST exclusion constraint)
- **Tailwind CSS v4** for a clean, mobile-first UI
- **Resend** for transactional email (console fallback in development)
- Deployable free on **Vercel + Neon + Resend** behind **Cloudflare DNS** at `ap2d.ca`, or
  self-hosted via **Docker Compose**.

## Features (v1)

- Login wall: only approved accounts reach the app. Registration creates a `PENDING` account that an
  admin activates.
- Roles: **member**, **admin**, **guest** (with an expiry date; auto-deactivated by the daily job).
- Weekly + day-grid calendar; your bookings show green, others show grey (no names) — admins see names.
- Booking with server-side conflict prevention, same-day booking, configurable rules.
- **Split weekly limits**: a standard-hours cap (default 12h/week, Mon–Fri 09:00–17:00) and unlimited
  after-hours, both configurable per instrument with per-user overrides.
- **Approval**: per-instrument and per-user; Raman defaults to auto-confirm for trained users.
- **Training gate**: only users an admin has marked trained can book a given instrument.
- **Raman session sign-in/out**: laser on / already-on, calibration + photon counts for 532/633/785 nm,
  a Skip option (audited), early sign-out with optional slot release, and unsigned-out handoff flagging.
- **Live status card** on the homepage (Available / Reserved / In use / Maintenance).
- **Waitlist** with email notification when a slot frees up.
- **Admin**: user management, instrument rules, maintenance mode, booking moderation, session log, and
  **CSV export** (all-time by default, optional custom date range).
- **Email**: account approval, booking confirm/cancel, and 24h/1h reminders, with per-user preferences.

## Local development

Requires Node 20+ and a PostgreSQL database. The quickest path uses Docker.

```bash
# 1. Start Postgres (and Mailpit for local email capture)
docker compose up -d

# 2. Configure environment
cp .env.example .env        # then edit values as needed

# 3. Install dependencies
npm install

# 4. Apply the schema and seed the Raman instrument + first admin
npm run db:deploy
npm run db:seed

# 5. Run the app
npm run dev                 # http://localhost:3000
```

Sign in with the seeded admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`) and change the
password. Without `RESEND_API_KEY`, all emails are printed to the server console.

### Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run db:deploy` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Seed instrument + first admin |
| `npm run db:studio` | Open Prisma Studio |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL connection string (use `?sslmode=require` for Neon) |
| `APP_URL` | yes | Public base URL, no trailing slash (e.g. `https://ap2d.ca`) |
| `APP_TIMEZONE` | no | Display/rule timezone (default `America/Toronto`) |
| `SEED_ADMIN_EMAIL` | seed | First admin email (default `1auqilsha@gmail.com`) |
| `SEED_ADMIN_USERNAME` | seed | First admin username (default `admin`) |
| `SEED_ADMIN_PASSWORD` | seed | First admin temporary password — change after first login |
| `RESEND_API_KEY` | prod | Resend API key; if empty, emails are logged to the console |
| `EMAIL_FROM` | no | From address (e.g. `Kherani Lab Bookings <bookings@ap2d.ca>`) |
| `CRON_SECRET` | prod | Bearer token required to call `/api/cron` |

## Deploy: Vercel + Neon + Resend (free tier) at `ap2d.ca`

1. **Neon** — create a free Postgres project; copy the pooled connection string (`?sslmode=require`).
2. **Vercel** — import the GitHub repo. Set the environment variables above. The build runs
   `prisma generate && next build`.
3. **Migrate + seed** — point your local `DATABASE_URL` at Neon and run `npm run db:deploy` then
   `npm run db:seed` once (or run them from a Vercel deploy hook / one-off job).
4. **Custom domain** — in Vercel add `ap2d.ca`. In Cloudflare DNS add an `A` record `@` →
   `76.76.21.21` (or the apex target Vercel shows), proxy set to **DNS only** for simplest SSL. Set
   `APP_URL=https://ap2d.ca`.
5. **Resend** — verify `ap2d.ca`, add the SPF/DKIM records in Cloudflare, and set `RESEND_API_KEY` and
   `EMAIL_FROM` (e.g. `bookings@ap2d.ca`).
6. **Cron** — `vercel.json` schedules `/api/cron` daily. Vercel sends the `CRON_SECRET` as a Bearer
   token automatically. For timely 1-hour reminders, also hit `/api/cron` every ~15 minutes from a free
   external pinger (e.g. cron-job.org) with header `Authorization: Bearer <CRON_SECRET>`. The endpoint
   is idempotent, so calling it frequently is safe.

### Cost ladder (spend as little as possible)

- **$0** — Vercel Hobby + Neon Free + Resend Free + Cloudflare DNS.
- **~$3–7/mo** — Neon Launch (pay-as-you-go, set a spending cap) if cold starts bother users.
- **~$5/mo** — self-host on a small VPS (below) for always-on with no cold starts.

## Self-host with Docker (Tier C)

The included `Dockerfile` builds a standalone image; `docker-compose.yml` provides Postgres.

```bash
# Build and run the app image alongside Postgres
docker compose up -d postgres
docker build -t ap2d-bookings .
docker run --env-file .env -p 3000:3000 ap2d-bookings
```

Put a reverse proxy (e.g. Caddy) in front for automatic HTTPS, point Cloudflare DNS at the VPS, and run
the cron endpoint from a system cron or the host scheduler.

## Booking & session rules (defaults)

| Rule | Raman default |
|------|---------------|
| Slot grid | 30 minutes |
| Max session length | 4 hours |
| Advance window | 14 days |
| Minimum notice | 0 (book on arrival) |
| Cancellation cutoff | none (cancel anytime) |
| Standard hours | Mon–Fri 09:00–17:00 (America/Toronto) |
| Standard-hours weekly cap | 12 hours/user/week |
| After-hours weekly cap | unlimited |
| Approval | auto-confirm for trained users |

Session sign-in opens 15 minutes before the booked start and stays open until the end. Sign-out is
allowed anytime; signing out more than 30 minutes early offers to release the remaining time. If a new
user signs in while a previous session is still open, the previous session is flagged `unsigned-out`.

## Data ownership & privacy

All booking and session data lives in your own database. The CSV export gives full data portability.
Booking metadata is lab-internal; members never see other members' names — only that a slot is booked.

## License

MIT — see [LICENSE](LICENSE).
