# Project Brief
## [HOST_NAME] Appointment Scheduler

---

## What This Is

A lightweight, single-page appointment booking web application. A booker visits a public URL, selects a meeting duration, picks a date and time, fills in their details, and confirms. No login required. No database. The host manages all availability directly in Google Calendar.

The full product specification lives in `PRD.md`. The build plan lives in `WORKPLAN.md`. Before starting any phase, read the current phase document in `phases/`.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Next.js App Router (API Routes) |
| Data storage | Google Calendar API — no database |
| Email | Gmail API via Google OAuth2 |
| SMS | Twilio |
| Error monitoring | Sentry (wrap all API routes from day one) |
| Hosting | Render.com — push to `main` triggers redeploy |

---

## Authentication

Google Calendar and Gmail access uses **OAuth2**, not a Service Account. The host completed a one-time authorization flow. Credentials are stored as environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
- `GMAIL_USER`

Never use a Service Account. Never commit credentials. All environment variables are defined in `.env.example`.

---

## Architecture Principles

- **No database.** Google Calendar is the sole source of truth for all booking data. Bookings are Calendar events. Availability is read from the Freebusy API and Working Hours. Cancellation tokens are stored in event `extendedProperties`.
- **No admin panel.** The host manages availability by adding and removing events in Google Calendar directly.
- **No login for bookers.** The booking page is fully public. Cancel/reschedule is token-based, no authentication required.
- **Serverless-friendly.** Keep all logic in Next.js API routes. No persistent server state.
- **Modular booking logic.** Structure the codebase so that Supabase, Stripe, and Clerk can be introduced in v2 without a rewrite.

---

## Key Behaviors

- Bookings are **auto-confirmed** — no host approval step.
- **No cancellation policy** — bookers can cancel or reschedule at any time.
- The booking page must include `<meta name="robots" content="noindex, nofollow">`.
- Race conditions on slot selection are handled by re-querying Freebusy immediately before creating a booking.
- All API routes must be wrapped with Sentry error capture.
- All times shown to the booker are displayed in their local timezone (detected via `Intl` API, overridable).

---

## Communication Tone

All emails and SMS sent by the application follow a specific voice. The full tone guide is in `PRD.md` Section 7. The short version:

- Warm, dry, understated wit — never corporate, never over-casual.
- Humor steps aside completely for cancellations, errors, and sensitive moments — those are warm but purely functional.
- No emoji. No excessive exclamation marks. No jargon.
- SMS to the host is brief and functional — lead with the most important information.

---

## Workflow Rule

Read the current phase document in `phases/` before writing any code. The phase document is the authoritative instruction set for the current task. Complete the phase, then stop and wait for sign-off.
