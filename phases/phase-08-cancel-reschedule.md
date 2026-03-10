# Phase 8 — Cancellation & Reschedule Flow

**Status:** ⬜ Not started
**Depends on:** Phase 7 signed off
**Reference:** `PRD.md` Section 6.5 (Cancellation & Reschedule), Section 12.6 (Invalid Token), Section 7 (Tone Guide)

---

## Goal

Build the cancel and reschedule experience at `/manage/[token]`. This page is accessed via the unique link in the booker's confirmation email. It must correctly identify the booking, allow the booker to cancel or pick a new time, and update Google Calendar accordingly.

---

## Deliverable

A fully functional `/manage/[token]` page that:
- Loads and displays the booking details for a valid token
- Allows the booker to cancel or reschedule
- Sends the correct emails and SMS for each action
- Handles invalid or expired tokens gracefully
- Matches the booking page visual design

---

## Page: `app/manage/[token]/page.tsx`

### On Load
1. Call `GET /api/bookings/[token]` to fetch the booking details
2. Show a loading state while fetching
3. If the token is valid: display the booking details and present two options
4. If the token is invalid or not found: show the error state (see below)

### Booking Details Display
Show a clean summary card:
- Booker's name
- Date and time (in the browser's detected timezone)
- Duration
- Meeting type and location details
- Description (if present)

### Two Action Options
Present two clearly distinct buttons or sections:
- **"Cancel this booking"** — destructive action, styled accordingly (e.g., outlined or secondary)
- **"Reschedule"** — primary action

---

## Cancel Flow

1. User clicks "Cancel this booking"
2. Show a confirmation prompt inline (do not navigate away): *"Are you sure you want to cancel your [Duration] meeting with [HOST_NAME] on [Date] at [Time]? This cannot be undone."*
3. Two buttons: "Yes, cancel it" and "Keep my booking"
4. On confirm:
   a. Call `DELETE /api/bookings/[token]`
   b. Call `POST /api/email/confirmation` variant for cancellation — send cancellation email to the booker
   c. Call `POST /api/email/notification` variant for cancellation — send cancellation notification to the host
   d. Call `POST /api/sms/notification` variant for cancellation — send cancellation SMS to the host
   e. On success: show the cancellation confirmation screen
   f. On failure: show an error message — do not show a success state

### Cancellation Emails

**To booker:**
- Subject: e.g., `"Your meeting with [HOST_NAME] has been cancelled"`
- Tone: warm, no humor — functional and clear. Acknowledge without dwelling.
- Include: cancelled date/time, a link back to the booking page to rebook

**To host:**
- Subject: e.g., `"Cancelled: [Booker Name] — [Date] at [Time]"`
- Tone: brief and informative

**Cancellation SMS to host:**
```
Cancelled: [Name] — [Day, Date] at [Time] — [Duration] Min [Meeting Type]
```

### Cancellation Confirmation Screen
- Clear visual indicator that the booking is cancelled
- *"Your appointment on [Date] at [Time] has been cancelled."*
- Link to book a new time: `[APP_URL]`

---

## Reschedule Flow

1. User clicks "Reschedule"
2. Show the same calendar and time slot UI from the booking page, pre-populated with:
   - The same duration as the original booking
   - The original date highlighted (but selectable for a new choice)
3. The booker selects a new date and time
4. A "Confirm Reschedule" button appears once a new time is selected
5. On confirm:
   a. Call `PATCH /api/bookings/[token]` with the new start time
   b. Call `POST /api/email/confirmation` variant for reschedule — send updated confirmation to the booker with new `.ics`
   c. Call `POST /api/email/notification` variant for reschedule — notify the host of the change
   d. Call `POST /api/sms/notification` variant for reschedule — SMS the host
   e. On success: show the reschedule confirmation screen
   f. On 409 (new slot taken): show "Sorry, that time was just taken. Please choose another slot." Refresh availability.
   g. On other failure: show an error message — do not show a success state

### Reschedule Emails

**To booker:**
- Subject: e.g., `"Your meeting with [HOST_NAME] has been rescheduled — [New Day, Date] at [New Time]"`
- Tone: warm, minimal wit — positive but don't oversell it
- Include: new date/time, updated `.ics` attachment, cancel/reschedule link (same token)

**To host:**
- Subject: e.g., `"Rescheduled: [Booker Name] — now [New Date] at [New Time]"`
- Include: old time, new time, all other booking details

**Reschedule SMS to host:**
```
Rescheduled: [Name] — now [Day, Date] at [Time] — [Duration] Min [Meeting Type]
```

### Reschedule Confirmation Screen
- *"You're rescheduled. [HOST_NAME] will see you on [New Day, Date] at [New Time TZ]."*
- Updated "Add to Calendar" buttons with new time
- Link to cancel if needed (same token URL)

---

## Invalid / Expired Token State

If `GET /api/bookings/[token]` returns 404:
- Show a clear, calm message: *"This link is no longer valid. The appointment may have already been cancelled or rescheduled."*
- Provide the host's contact email (`CONTACT_EMAIL`) for manual resolution
- Provide a link to book a new time: `[APP_URL]`
- Tone: neutral and helpful — no humor, no alarm

---

## Styling

- The `/manage/[token]` page must match the visual design from Phase 2 exactly
- Use the same components, spacing, and color palette as the booking page
- The calendar/time slot UI reused in the reschedule flow must be the same component as used in the booking page — do not duplicate it

---

## Sentry Instrumentation

Wrap all route interactions on this page with Sentry error capture:
- `GET /api/bookings/[token]`
- `DELETE /api/bookings/[token]`
- `PATCH /api/bookings/[token]`
- All email and SMS calls triggered from this page

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] A valid token from a real confirmation email correctly loads the booking details
- [ ] Invalid token shows the correct error message with contact email and rebook link
- [ ] Cancel flow: confirmation prompt appears before deletion
- [ ] Cancel flow: event is deleted from the host's Google Calendar
- [ ] Cancel flow: booker receives a cancellation email
- [ ] Cancel flow: host receives a cancellation notification email
- [ ] Cancel flow: host receives a cancellation SMS
- [ ] Cancel flow: cancellation confirmation screen displays correctly
- [ ] Reschedule flow: calendar UI loads with availability for the correct duration
- [ ] Reschedule flow: `PATCH` updates the existing event (not creates a new one)
- [ ] Reschedule flow: booker receives a reschedule confirmation email with updated `.ics`
- [ ] Reschedule flow: host receives a reschedule notification email
- [ ] Reschedule flow: host receives a reschedule SMS
- [ ] Reschedule flow: race condition on new slot shows correct error and refreshes availability
- [ ] Email copy for all actions follows the tone guide
- [ ] Page styling matches the booking page design
- [ ] All actions are wrapped with Sentry error capture
