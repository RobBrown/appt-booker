# Phase 7 — Connect UI to API (Live Booking Flow)

**Status:** ⬜ Not started
**Depends on:** Phase 6 signed off
**Reference:** `PRD.md` Section 5, Section 6, Section 12 (Edge Cases)

---

## Goal

Replace all mock data in the booking page UI with real API calls. A completed booking must create a real Google Calendar event, send a real confirmation email to the booker, send a real notification email to the host, and send a real SMS to the host. Error and loading states must be handled correctly throughout.

---

## Deliverable

A fully functional end-to-end booking flow on the live page. A test booking must:
- Appear as an event in the host's Google Calendar within 5 seconds
- Trigger a confirmation email from `GMAIL_USER` to the booker within 60 seconds
- Trigger a notification email to `GMAIL_USER` within 60 seconds
- Trigger an SMS to `HOST_PHONE_NUMBER` within 60 seconds

---

## Changes from Phase 6

Replace mock data with live API calls at these points:

### On Page Load
- Call `GET /api/availability` to determine which days have available slots for the default duration (or the duration from URL params if present — see booking link personalization below)
- Populate the monthly calendar and the next 7 available days strip with real data
- Show a loading skeleton while availability data is fetching

### On Duration Selection
- Re-call `GET /api/availability` for the newly selected duration
- Update the calendar and strip with the new availability data
- Show a loading skeleton during refetch

### On Date Selection
- Call `GET /api/availability?date=[selected]&duration=[selected]&timezone=[selected]` to fetch time slots for the selected day
- Populate the time slot column with real slots
- Show a loading skeleton while slots are loading

### On "Confirm Booking" Submit
Execute the following sequence. On any failure, stop the sequence and show the appropriate error — do not proceed to the next step:

1. Call `POST /api/bookings` to create the Google Calendar event
   - On 409 (race condition): show inline message "Sorry, that time was just taken. Please choose another slot." Refresh availability for the current date. Do not show the confirmation screen.
   - On 503 (API unreachable): show "We're having trouble confirming your booking. Please try again in a moment." Do not show the confirmation screen.
2. Call `POST /api/email/confirmation` to send the booker's confirmation email
   - On failure: log to Sentry, display booking details on-screen with instructions to screenshot or copy them. Show a note: "Your booking is confirmed — we just had trouble sending the confirmation email. Here are your details." Do not roll back the booking.
3. Call `POST /api/email/notification` to notify the host
   - On failure: log to Sentry silently — do not surface this error to the booker
4. Call `POST /api/sms/notification` to notify the host via SMS
   - On failure: log to Sentry silently — do not surface this error to the booker
5. On full success: transition to the confirmation screen

---

## Loading States

Every async action must have a visible loading state. Do not leave the UI unresponsive.

| Action | Loading State |
|---|---|
| Initial availability fetch | Skeleton placeholder in calendar and day strip |
| Duration change availability fetch | Skeleton placeholder replaces calendar content |
| Date selection slot fetch | Skeleton placeholder in time slot column |
| Confirm Booking submit | Button shows spinner and is disabled; form is non-interactive |

---

## Error States

All error messages shown to the booker must be user-friendly. Never expose raw API errors or stack traces.

| Error | Message |
|---|---|
| Slot taken (race condition) | "Sorry, that time was just taken. Please choose another slot." |
| Calendar API unreachable | "We're having trouble confirming your booking. Please try again in a moment." |
| Email failure after booking | "Your booking is confirmed — we just had trouble sending the confirmation email. Here are your details: [booking details]." |
| No available slots | "Fully booked right now. Check back soon, or reach out directly at [CONTACT_EMAIL]." |
| Timezone detection failure | Default to UTC, show timezone selector prominently |

---

## Booking Link Personalization

Support URL query parameters that pre-select options on page load:

- `?duration=30` — pre-selects the 30-minute duration card (accepts 15, 30, 60, 120)
- `?type=zoom` — pre-selects the meeting type (accepts `in-person`, `phone`, `zoom`, `google-meet`, `webex`, `jitsi`)

If the query parameter values are invalid, ignore them and use defaults.

---

## Sentry Instrumentation

Confirm Sentry is capturing errors at these points:
- `GET /api/availability` failures
- `POST /api/bookings` failures
- `POST /api/email/confirmation` failures
- `POST /api/email/notification` failures
- `POST /api/sms/notification` failures
- Any unhandled client-side errors in the booking flow

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] Availability data loads from the real Google Calendar API on page load
- [ ] Changing duration refreshes availability correctly
- [ ] Selecting a date loads real time slots
- [ ] Completing a booking creates a real event in the host's Google Calendar within 5 seconds
- [ ] Booker receives a confirmation email from `GMAIL_USER` with correct details and `.ics` attachment within 60 seconds
- [ ] Host receives a notification email at `GMAIL_USER` within 60 seconds
- [ ] Host receives an SMS at `HOST_PHONE_NUMBER` within 60 seconds
- [ ] Blocking time in Google Calendar removes those slots from the UI
- [ ] Race condition: if a slot is taken between selection and submission, the correct error message appears and availability refreshes
- [ ] Google Calendar API failure shows the correct error message (no success state shown)
- [ ] Email failure after booking shows booking details on-screen with the correct message
- [ ] All loading skeletons display during async operations
- [ ] URL params `?duration=` and `?type=` correctly pre-select options
- [ ] Sentry is capturing errors from all API routes
- [ ] `noindex` meta tag is present and correct
