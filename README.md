# Appointment Scheduler

In terms of AI assisted software development, it is 12:01 AM. One of the most interesting ways I have seen software development evolve in the last 60 seconds is our new ability to solve very specific problems very quickly.

Appointment scheduling is a good example. Calendly works. Google has a scheduling app. Many CRMs do as well. But I wanted something simple to use. Something private that shares zero information with anyone but me. I wanted something that does not rely on a single virtual meeting provider. I also wanted to incorporate bleeding edge AI assisted development, testing, security reviews, and more.

So here we are. I built my own scheduling app. The approach I landed on is, I think, genuinely more elegant than what most tools do.

TL;DR=

Someone visits the page, picks a duration, chooses a date and time, fills in their details, and confirms. A Google Calendar event is created instantly. A confirmation email with an `.ics` attachment goes to them. A notification email lands in my inbox. The whole thing runs on infrastructure I control, and the only persistent store is my Google Calendar.

No database. No admin panel. No 3rd party privacy concerns. Just a Next.js app talking directly to APIs I was already using.

---

## The core idea

Most scheduling tools solve the availability problem by introducing a database. They store your availability rules, your booked slots, your contacts, your preferences. They become the source of truth. You become dependent on their platform, their pricing, and their privacy policy.

I kept asking: why does a second database need to exist at all?

**Google Calendar is the database.** I manage my schedule there. The Freebusy API tells the app which slots are taken. Creating a booking means creating a calendar event. Cancelling a booking means deleting one. Rescheduling patches the existing event in place, preserving its ID, so calendar clients update rather than duplicate. There is no second system to keep in sync, because there is only one system.

The cancellation token that lets a booker manage their appointment? Stored in the calendar event's `extendedProperties.private` field. No lookup table. No sessions. The event carries everything the application needs to know about itself.

The result is an application that has no database to provision, no schema to migrate, no records to back up, and no admin interface to maintain. Block a morning off in Google Calendar and the app picks it up automatically. The entire availability model is just: whatever Google Calendar says is free, is free.

I find that deeply satisfying.

---

## How it works

### Availability

When a visitor opens the booking page and selects a duration, the app queries the Google Calendar Freebusy API for the current month in a single request. It then walks each working day, comparing every possible 15-minute-aligned slot against the busy periods, to determine which dates have at least one open slot. Those dates are highlighted in the calendar.

When the visitor selects a specific date, the app makes a second Freebusy call scoped to that day and returns the exact available time slots, displayed in the visitor's local timezone.

Working hours are read directly from the Google Calendar `workingHours` setting. If that setting is not configured, the app falls back to `WORKING_HOURS_START`/`WORKING_HOURS_END` env vars, and then to Monday-Friday 9:00-17:00.

### Booking

When a visitor confirms a booking, the following happens in sequence:

1. **Race condition guard:** the app re-queries Freebusy for the exact slot window immediately before creating the event. If the slot was taken in the time between selection and confirmation, the booking is rejected with a clear message and the slot list refreshes.

2. **Calendar event creation:** a Google Calendar event is created via the Events API. The event title, description, timezone, and all booking details are written to the event. A UUID cancellation token is stored in the event's `extendedProperties.private` field, a self-contained record the application can parse without a database.

3. **Confirmation email:** sent from my Gmail account to the booker via the Gmail API. It includes full meeting details and an `.ics` calendar attachment built to the iCalendar spec, with `METHOD:REQUEST` so it creates or updates an event in any calendar application.

4. **Host notification:** a notification email goes to me. This is fire-and-forget: if it fails, Sentry captures the error silently. The booking has already succeeded.

### Virtual meetings

The booking form supports six meeting formats: Zoom, Google Meet, Jitsi, WebEx, phone call, and in-person. For Zoom, Google Meet, and Jitsi, a meeting link can be generated directly from the booking form using the respective provider API. The generated link is stored in the calendar event and included in all emails.

### Cancellation and rescheduling

Every confirmation email contains a unique link: `/manage/[token]`. The token maps to a Google Calendar event via the `privateExtendedProperty` filter on the Calendar API's event list endpoint. No database lookup required.

From the manage page, the booker can:

- **Cancel:** deletes the calendar event and sends cancellation emails to both parties.
- **Reschedule:** presents the same calendar UI with fresh availability. Selecting a new time patches the existing calendar event in place (preserving the event ID and token), and sends an updated `.ics` to the booker with the same UID so calendar applications update the existing entry rather than creating a new one.

### Reminders

A GitHub Actions workflow runs every hour and calls `POST /api/cron/reminders`, protected by a `CRON_SECRET` bearer token. The route queries Google Calendar for events in the next 25 hours, filters for events created by this application (identified by the `token` field in `extendedProperties`), and sends reminder emails at two windows:

- **24 hours before:** email to booker, email to host
- **1 hour before:** email to booker, email to host

Each reminder send is isolated in a try/catch. One failure does not stop the others. All failures are captured to Sentry with the event ID and reminder type as context.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS |
| API | Next.js App Router route handlers |
| Availability | Google Calendar Freebusy API |
| Booking storage | Google Calendar Events API |
| Email | Gmail API via OAuth2 |
| Virtual meetings | Zoom Server-to-Server OAuth, Google Meet API, Jitsi |
| Rate limiting | Upstash Redis (sliding window) |
| Error monitoring | Sentry |
| Hosting | Render.com |
| Cron | GitHub Actions (hourly scheduled workflow) |

---

## Security

Several layers of hardening are built in:

- **Rate limiting:** all API endpoints are protected with per-IP sliding window limits via Upstash Redis. If Upstash is unreachable, the app fails closed (503) rather than open.
- **CORS:** a middleware layer blocks cross-origin `POST`/`PATCH`/`DELETE` requests from unrecognised origins.
- **Input validation:** server-side validation on all user inputs: email format, field length limits, IANA timezone validation.
- **HTML escaping:** all user-supplied fields are HTML-escaped before interpolation into email templates, preventing HTML/CSS injection in sent emails.
- **Security headers:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and a `Content-Security-Policy` are set on all responses.
- **MIME header sanitisation:** carriage returns and newlines are stripped from all email header values to prevent MIME header injection.
- **Timing-safe auth:** the cron endpoint uses `crypto.timingSafeEqual` to compare the bearer token, preventing timing oracle attacks.
- **Boot-time env validation:** the app throws a clear error at startup if any required environment variable is missing.
- **Zoom path traversal prevention:** Zoom meeting IDs extracted from user-supplied URLs are validated as numeric-only before use in API calls.

---

## Self-hosting

### Prerequisites

- A Google Cloud project with the Calendar API and Gmail API enabled
- A Google OAuth2 client (Desktop app type) with a refresh token, completed via the one-time consent flow using OAuth Playground or a local callback script
- An Upstash Redis database (free tier is sufficient)
- A Sentry project
- A Render.com account (or any Node.js host)

### Environment variables

Copy `.env.example` to `.env.local` and fill in every value:

```
# Host identity
HOST_NAME=               # Your name, shown on the booking page
HOST_DOMAIN=             # Your production domain, e.g. book.example.com (no protocol)

# Google OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=      # Usually your Gmail address
GMAIL_USER=              # Your Gmail address

# Zoom (optional, Server-to-Server OAuth app)
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# App configuration
DEFAULT_LOCATION=        # zoom | google-meet | phone | in-person | webex | jitsi
DEFAULT_ADDRESS=         # Physical address if DEFAULT_LOCATION=in-person
CONTACT_EMAIL=           # Shown to bookers for questions

# Working hours (optional, overrides Google Calendar settings)
WORKING_HOURS_START=     # HH:MM in 24h format, e.g. 09:00
WORKING_HOURS_END=       # HH:MM in 24h format, e.g. 17:00
HOST_TIMEZONE=           # IANA timezone, e.g. America/Toronto

# Booking page
TOPIC_CHIPS=             # Pipe-separated preset agenda options
LATE_MESSAGE_DELAY_MINUTES=  # Minutes after which a "late" message appears

# Sentry
SENTRY_DSN=

# Cron
CRON_SECRET=             # Generate with: openssl rand -hex 32

# Duration labels (optional, pipe-separated label|hint)
DURATION_LABEL_15=
DURATION_LABEL_30=
DURATION_LABEL_60=
DURATION_LABEL_120=
```

### Deploy to Render

1. Connect your GitHub repository to Render as a Web Service
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Add all environment variables from `.env.example` in the Render dashboard

### Cron setup

The reminder job uses a GitHub Actions scheduled workflow (`.github/workflows/reminders.yml`). Add two values to your repository's Actions configuration:

- **Secret:** `CRON_SECRET`, the same value as in your environment variables
- **Variable:** `APP_URL`, your production URL

The workflow runs at the top of every hour and calls `POST /api/cron/reminders` with the bearer token. To test it manually, use the **Run workflow** button in the Actions tab, or:

```bash
curl -X POST https://your-app.example.com/api/cron/reminders \
  -H "Authorization: Bearer [CRON_SECRET]"
```

A `200` response with `processed: 0` means the job ran successfully with no reminders due.

---

## Architecture notes

**No database.** Every piece of booking state lives in a Google Calendar event. The event title, description, timezone, and cancellation token are all written at creation time. The application never needs to look anything up from a secondary store.

**No admin panel.** Availability is managed by adding and removing events in Google Calendar directly. Block a morning off, mark yourself out of office, create a recurring block. The Freebusy API sees all of it automatically.

**No login for bookers.** The booking page is fully public. Cancel and reschedule access is granted by possession of the token in the confirmation email link. No account, no password.

**Race condition handling.** Slot selection and booking confirmation are separated in time. Between the two, another visitor could take the same slot. The app re-queries Freebusy immediately before writing the calendar event and returns a `409` if the slot is gone, prompting the visitor to choose again.

**Timezone correctness.** All times are stored as UTC in Google Calendar. The booker's selected timezone is recorded in the calendar event and used to display times correctly in emails and reminders. The `date-fns-tz` library handles all timezone-aware conversions using `fromZonedTime` to convert local selections to UTC before storage.

---

## Lighthouse scores (production, mobile)

| Category | Score |
|---|---|
| Performance | 99 |
| Accessibility | 93 |
| Best Practices | 96 |
| SEO | 50 (intentional, `noindex`) |
