# Phase 9 — Reminder Emails & SMS

**Status:** ⬜ Not started
**Depends on:** Phase 8 signed off
**Reference:** `PRD.md` Section 6.4 (Reminder Emails & SMS), Section 7 (Tone Guide), Section 8.5 (`CRON_SECRET`)

---

## Goal

Implement automated reminder emails and SMS messages sent 24 hours and 1 hour before each booked meeting. Delivered via a Render.com Cron Job that calls a protected API route every hour.

---

## Deliverable

A working `POST /api/cron/reminders` route that:
- Queries Google Calendar for upcoming bookings
- Sends 24-hour reminder emails and SMS at the correct interval
- Sends 1-hour reminder emails and SMS at the correct interval
- Is protected from unauthorized calls via `CRON_SECRET`
- Is called every hour by a Render.com Cron Job

---

## Route: `POST /api/cron/reminders`

### Authorization

The route must reject any request that does not include the correct secret header:

```
Authorization: Bearer [CRON_SECRET]
```

Return `401` for any request missing or providing an incorrect secret. Never process the request without valid authorization.

### Logic

On each invocation:

1. Query Google Calendar for all events on `GOOGLE_CALENDAR_ID` in the next 25 hours
2. For each event, check if it has a `extendedProperties.private.token` — only process events created by this application (skip personal calendar events)
3. Parse the booking details from the event description field
4. Determine which reminder window the event falls in:
   - **24-hour window:** event starts between 23.5 hours and 24.5 hours from now (±30 min tolerance)
   - **1-hour window:** event starts between 45 minutes and 75 minutes from now (±15 min tolerance)
5. For events in the 24-hour window: send 24-hour reminders (see below)
6. For events in the 1-hour window: send 1-hour reminders (see below)
7. Log each send action (event ID, reminder type, timestamp) — to Sentry breadcrumbs or console
8. Return a summary response of what was sent

### Idempotency Note

This route runs every hour. The time windows have tolerances to catch events across cron runs. This means a single event could theoretically be reminded twice if the cron runs at exactly the boundary. Accept this edge case for v1 — it is extremely unlikely in practice.

---

## 24-Hour Reminders

### Email to Booker (via Gmail API)
- Subject: e.g., `"Reminder: you're meeting with [HOST_NAME] tomorrow at [Time]"`
- Tone: warm, light — a gentle heads-up with a touch of personality
- Include: date and time (booker's timezone — parse from event description), duration, meeting type and location details, cancel/reschedule link (`[APP_URL]/manage/[token]`), host contact email

### Email to Host (via Gmail API)
- Subject: e.g., `"Tomorrow: [Booker Name] at [Time]"`
- Include: booker name, date/time, duration, meeting type

### SMS to Host (via Twilio)
```
Reminder: [Name] — tomorrow at [Time] — [Duration] Min [Meeting Type]
```
Keep under 160 characters.

---

## 1-Hour Reminders

### Email to Booker (via Gmail API)
- Subject: e.g., `"Your meeting with [HOST_NAME] starts in 1 hour"`
- Tone: warm, slightly more urgent than the 24h reminder — still friendly
- Include: time (booker's timezone), meeting type, location details, cancel/reschedule link

### Email to Host (via Gmail API)
- Subject: e.g., `"Starting in 1 hour: [Booker Name] at [Time]"`
- Include: booker name, time, meeting type

### SMS to Host (via Twilio)
```
Starting in 1 hour: [Name] — [Time] — [Meeting Type]
```
Keep under 160 characters.

---

## Parsing Booking Details from Calendar Events

Since there is no database, the booker's name, email, and timezone must be parsed from the Google Calendar event description field. When events are created in Phase 4 (`POST /api/bookings`), the description must be structured to support this parsing.

Confirm that `POST /api/bookings` writes a structured description block, for example:

```
BOOKING_DATA
name: Jane Smith
email: jane@example.com
timezone: America/New_York
locationType: zoom
duration: 30
token: uuid-v4-here
/BOOKING_DATA

Meeting description provided by booker goes here.
```

If the event description does not contain a parseable `BOOKING_DATA` block, skip the event (it is not a booking created by this application).

> **Note:** If `POST /api/bookings` (Phase 4) does not already write this structured block, update it now before building the reminder logic. This is a dependency — the reminder cron cannot function without it.

---

## Render.com Cron Job Configuration

Update the placeholder Cron Job created in Phase 3:
- Schedule: every hour (`0 * * * *`)
- HTTP method: POST
- URL: `[APP_URL]/api/cron/reminders`
- Header: `Authorization: Bearer [CRON_SECRET]`

Confirm the Cron Job is active and the secret header is set correctly in the Render.com dashboard.

---

## Testing

Since this route runs on a schedule, test it by calling it directly:

```bash
curl -X POST https://[APP_URL]/api/cron/reminders \
  -H "Authorization: Bearer [CRON_SECRET]"
```

To test reminder sends without waiting 24 hours:
1. Create a test booking 24 hours and 5 minutes in the future
2. Trigger the cron route manually
3. Confirm the 24-hour reminder emails and SMS are sent
4. Repeat for a booking 65 minutes in the future to test the 1-hour reminder

---

## Sentry Instrumentation

Wrap the entire route handler with Sentry. Any failure during a reminder send (email or SMS) must be captured as a Sentry error with the event ID and reminder type as context. Do not let one failed reminder stop the processing of other events in the same run.

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] Route returns `401` for requests without the correct `CRON_SECRET` header
- [ ] Route correctly identifies upcoming bookings (only events with a `token` in `extendedProperties`)
- [ ] 24-hour reminder emails are sent to both the booker and the host at the correct interval
- [ ] 1-hour reminder emails are sent to both the booker and the host at the correct interval
- [ ] Host receives reminder SMS for both 24-hour and 1-hour windows
- [ ] Reminder emails follow the tone guide
- [ ] SMS messages are under 160 characters
- [ ] Route does not crash if a calendar event has no parseable booking data — it skips and continues
- [ ] Render.com Cron Job is active and configured with the correct URL and secret header
- [ ] Sentry is capturing any failures during reminder sends
- [ ] Manual trigger of the route sends real emails and SMS to the correct recipients
