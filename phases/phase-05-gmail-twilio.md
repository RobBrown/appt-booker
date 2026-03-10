# Phase 5 — Gmail & Twilio Integration

**Status:** ⬜ Not started
**Depends on:** Phase 4 signed off
**Reference:** `PRD.md` Section 6.2 (Confirmation Email), Section 6.3 (Host Notification), Section 7 (Tone Guide), Section 8.5 (Environment Variables)

---

## Goal

Build and verify the three notification routes: confirmation email to the booker, notification email to the host, and SMS to the host. No UI — triggered via direct API calls or a test script. The `.ics` attachment must open correctly in both Google Calendar and Apple Calendar.

---

## Deliverable

Three tested API route handlers:
- `POST /api/email/confirmation` — confirmation email with `.ics` to the booker
- `POST /api/email/notification` — booking notification email to the host
- `POST /api/sms/notification` — SMS notification to the host via Twilio

All three must be verified end-to-end with real sends before this phase is signed off.

---

## Tone Requirement

All email copy must follow the tone guide in `PRD.md` Section 7. The short version:
- Warm, dry, understated wit for confirmations and reminders
- No humor for cancellations, errors, or sensitive moments
- No emoji, no excessive exclamation marks, no corporate jargon
- SMS is purely functional — brief, clear, lead with the most important information

Reference examples are in `PRD.md` Section 7.4. Use them as calibration anchors when writing copy.

---

## Shared Gmail Helper

Create `lib/gmail.ts` — a shared helper for sending email via Gmail API using OAuth2 credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_USER`).

The helper must support:
- Sending plain text and HTML emails
- Attaching a `.ics` file
- Sending from `GMAIL_USER`

---

## Route 1 — `POST /api/email/confirmation`

**Purpose:** Send a confirmation email to the booker immediately after a booking is created.

**Request body:**
```json
{
  "bookerName": "Jane Smith",
  "bookerEmail": "jane@example.com",
  "startTime": "2026-03-10T14:00:00Z",
  "duration": 30,
  "timezone": "America/New_York",
  "locationType": "zoom",
  "locationDetails": "",
  "additionalAttendees": [],
  "description": "Discussing Q2 roadmap",
  "token": "uuid-v4-here"
}
```

**Email must include:**
- Subject: warm and clear — e.g., `"You're booked with [HOST_NAME] — [Day, Date] at [Time]"`
- Booker's name used naturally in the body
- Date and time displayed in the booker's timezone
- Duration
- Meeting type and location details
- All attendee names
- Meeting description (if provided)
- Cancel/reschedule link: `[APP_URL]/manage/[token]`
- Host's contact info (`CONTACT_EMAIL`)
- `.ics` file attached

**`.ics` file requirements:**
- Valid RFC 5545 format
- `DTSTART` and `DTEND` in UTC
- `SUMMARY`: `"Meeting with [HOST_NAME]"`
- `DESCRIPTION`: meeting details
- `LOCATION`: location type and details
- `ORGANIZER`: `GMAIL_USER`
- Must open and create a correct event in both Google Calendar and Apple Calendar

**Tone:** Warm, dry wit welcome. See `PRD.md` Section 7.4 for a reference example.

---

## Route 2 — `POST /api/email/notification`

**Purpose:** Notify the host of a new booking.

**Request body:** Same shape as Route 1.

**Email must include:**
- Subject: brief and informative — e.g., `"New booking: Jane Smith — [Day, Date] at [Time]"`
- All booking details: booker name, email, date, time (host's timezone), duration, location, additional attendees, description
- Sent from `GMAIL_USER` to `GMAIL_USER`

**Tone:** Friendly and brief — the host wants the facts quickly. No wit required but warmth is fine.

---

## Route 3 — `POST /api/sms/notification`

**Purpose:** Send an SMS to the host's phone via Twilio when a new booking is created.

**Request body:**
```json
{
  "bookerName": "Jane Smith",
  "startTime": "2026-03-10T14:00:00Z",
  "duration": 30,
  "locationType": "zoom"
}
```

**SMS format:**
```
New booking: [Name] — [Day, Date] at [Time] — [Duration] Min [Meeting Type]
```

Keep under 160 characters. No emoji. Lead with the most important information.

**Twilio configuration:** Use `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `HOST_PHONE_NUMBER`.

---

## Error Handling

### Email delivery failure
If the Gmail API call fails, log the error to Sentry and return a 500. The calling code (in Phase 7) will handle this gracefully on the UI side — do not swallow errors silently.

### SMS delivery failure
If the Twilio call fails, log to Sentry and return a 500. Do not block the booking flow for an SMS failure.

---

## Verification Steps

Test all three routes end-to-end with real sends:

1. Call `POST /api/email/confirmation` with test data — confirm the email arrives at the test booker address, renders correctly, and the `.ics` attachment opens in Google Calendar and Apple Calendar
2. Confirm the cancel/reschedule link in the email contains the correct token
3. Call `POST /api/email/notification` — confirm the notification email arrives at `GMAIL_USER` with all booking details
4. Call `POST /api/sms/notification` — confirm the SMS arrives at `HOST_PHONE_NUMBER` with the correct format
5. Check Sentry to confirm all three routes are instrumented

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] Confirmation email arrives promptly and renders correctly in an email client
- [ ] `.ics` file opens correctly in Google Calendar and creates the right event
- [ ] `.ics` file opens correctly in Apple Calendar and creates the right event
- [ ] Cancel/reschedule link in the email contains the correct token
- [ ] Host notification email arrives at `GMAIL_USER` with all booking details
- [ ] Host SMS arrives at `HOST_PHONE_NUMBER` in the correct format and under 160 characters
- [ ] Email copy follows the tone guide (warm, dry, no jargon, no excessive exclamation marks)
- [ ] All three routes are wrapped with Sentry error capture
- [ ] Gmail helper (`lib/gmail.ts`) is reusable and not duplicated across routes
