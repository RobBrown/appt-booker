# Product Requirements Document
## Appointment Scheduling Application

---

| Field | Details |
|---|---|
| **Document Version** | 1.0 |
| **Author** | Product Management |
| **Date** | March 4, 2026 |
| **Status** | Draft – For Developer Review |
| **Intended Audience** | Software Developer |
| **Product Owner** | [HOST_NAME] |

---

## 1. Executive Summary

The host needs a clean, single-screen web application that lets any person schedule a meeting with him — without back-and-forth emails. The application is publicly accessible via a shareable URL, requires no login from the booker, and guides the visitor through every decision (duration, date, time, location, and attendee details) in a single, flowing form. The host receives an instant confirmation notification, and the booker receives a calendar invite and confirmation email.

*This PRD defines all features, UX flows, data requirements, and edge-case behaviors the developer needs to build the application end-to-end.*

---

## 2. Goals & Success Metrics

### 2.1 Primary Goals

- Eliminate scheduling friction — a booker should complete a booking in under 90 seconds.
- Zero double-bookings — the system must respect the host's live calendar availability.
- Mobile-first responsiveness — the full booking flow must work on any screen size.
- Accessible and inclusive — WCAG 2.1 AA compliance.

### 2.2 Success Metrics

| Metric | Target |
|---|---|
| Booking completion rate | > 80% of sessions that reach the page |
| Time-to-book (median) | < 90 seconds |
| Double-booking incidents | 0 per month |
| Mobile usability score (Lighthouse) | > 90 |
| Confirmation email delivery rate | > 99% |

---

## 3. User Personas

### 3.1 The Booker (Primary User)

Any person who has been given the host's scheduling link — a client, colleague, prospect, or personal contact. They may be on a phone, tablet, or desktop. They are not necessarily tech-savvy, and they have never used this app before. Their single goal is to pick a time and confirm it as fast as possible.

### 3.2 The Host (Administrator)

The host is the sole owner of the application. He manages his availability through a simple admin panel and receives notifications for every booking, cancellation, or reschedule. The host does not participate in the booking flow itself — he is the recipient of the appointment.

---

## 4. Scope

### 4.1 In Scope

- Public-facing single-page booking interface
- Google Calendar as the sole source of truth for availability and bookings
- Automated email confirmations and reminders (via Gmail API, sent from [HOST_EMAIL])
- ICS calendar file attachment for booker
- Cancellation and reschedule flow
- SMS reminders via Twilio
- Error monitoring via Sentry

### 4.2 Out of Scope (v1.0)

- Database (Google Calendar replaces this entirely)
- Admin panel (The host manages availability directly in Google Calendar)
- Authentication / Clerk (no admin panel to protect)
- Microsoft Outlook integration
- Payment processing / Stripe (v2)
- Multi-host / team scheduling
- Group bookings (multiple bookers for the same slot)
- Native mobile application

---

## 5. Core Booking Flow — Detailed UX

The entire booking experience lives on one screen. The page is divided into logical, clearly labeled steps that the user moves through in a natural top-to-bottom or left-to-right reading order. No page reloads. No multi-page wizard steps. Everything is visible and contextual.

---

### Step 1 — Meeting Duration

Displayed immediately when the page loads, before anything else.

- Four large, tappable cards are shown side-by-side (stacked on mobile):
  - 15 Minutes
  - 30 Minutes
  - 60 Minutes
  - 2 Hours
- Selecting a duration card highlights it with the host's brand color and causes the calendar below to animate into view, preventing the page from feeling overwhelming on load.
- The selected duration controls which time slots are shown in the calendar (e.g., a 2-hour slot needs 2 consecutive hours of availability).
- **UX Enhancement:** Display a brief purpose hint beneath each card, e.g., "Quick check-in" under 15 min, "Deep-dive discussion" under 60 min. The host should be able to customise these labels in the admin panel.

---

### Step 2 — Date & Time Selection

The calendar section appears below (or beside on desktop) the duration selector after a duration is chosen.

#### Monthly Calendar View

- Displays the current month by default.
- Days with no available slots are greyed out and non-interactive.
- Days with available slots show a subtle dot indicator below the date number.
- Previous/Next month navigation arrows are clearly visible.
- The calendar should never show dates in the past as selectable.
- **UX Enhancement:** Show a "Next available" badge on the nearest open date if today has no slots, so the user does not scan an empty week.

#### Next 7 Available Days Strip

- Below (or beside) the monthly grid, show a horizontal scrollable strip of the next 7 days that actually have open slots — displayed as pill-shaped date chips (e.g., "Mon Mar 10").
- Tapping a chip selects that day both in the chip strip AND highlights it on the monthly calendar for visual coherence.
- This shortcut dramatically reduces the number of taps for users whose booking is soon.

#### Time Slot Selection

- Once a date is selected, the available time slots for that day appear in a scrollable column to the right of the calendar (below on mobile).
- Slots are displayed at 15-minute increments by default and filtered to show only durations that fit (e.g., a 2-hour meeting does not show a slot starting at 4:45 PM if the host's availability ends at 5:00 PM).
- A single click/tap selects the slot and immediately highlights it — no confirm button needed at this step.
- 12h / 24h toggle at the top of the time slot column (persists via localStorage).
- **UX Enhancement:** Add a soft "morning / afternoon / evening" grouping header above the relevant slot clusters to aid quick scanning.

#### Timezone Handling

- The page automatically detects the booker's timezone using the browser's `Intl` API (no permission required).
- The detected timezone is displayed prominently near the calendar as a clickable/editable field (e.g., "Showing times in: America/New_York ✎").
- Clicking the timezone label opens an inline searchable dropdown of IANA timezone strings — booker can override it.
- All times displayed to the booker are always in their selected timezone.
- the host's admin panel stores his availability in his local timezone; conversion happens server-side.

---

### Step 3 — Meeting Details Form

After a time slot is chosen, a smooth-scrolling form section animates into view (or becomes active if already visible below the fold). This form collects contextual details about the meeting.

#### 3a. Meeting Location

A segmented button group (radio-style selector) with icons:

- 🏢 In Person
- 📞 Phone Call
- 💻 Zoom
- 📹 Google Meet
- 🔵 WebEx
- 🟢 Jitsi Meet

**Conditional field logic:**

- If **In Person** is selected → show a required address input field. Optionally integrate a Google Places autocomplete for address lookup. Also show the host's default meeting address as a pre-filled suggestion (configurable in admin).
- If **Phone Call** is selected → show a required "Phone number (The host will call you)" field with international format support. Hide the backup phone field (phone IS the meeting).
- If **any virtual option** is selected → show a non-required "Backup phone number (in case of technical issues)" field.

**UX Enhancement:** The host should be able to set a "default" or "preferred" meeting type in the admin panel. The preferred option is pre-selected when the page loads, saving most users a click.

#### 3b. Attendee Information

- **Your Name** — required, free text, max 100 characters.
- **Your Email Address** — required, validated email format, used for confirmation delivery.
- **Additional Attendees** — optional, repeatable. A "+" button that adds another name/email row. Max 10 additional attendees. Each row has: Full Name (required) + Email Address (optional).
- **UX Enhancement:** An "Additional Attendees" count badge updates live as rows are added, e.g., "3 attendees total." Each row also shows a remove "✕" button.

#### 3c. Meeting Description

- A single multi-line textarea — optional but strongly encouraged via placeholder text.
- Placeholder: *"Briefly describe the purpose of this meeting and any agenda items or questions you'd like to cover."*
- Max 1,000 characters. Live character counter shown below the field (e.g., "340 / 1000").
- **UX Enhancement:** Include pre-set topic quick-select chips above the textarea (The host configures these in admin, e.g., "Project Review", "Introduction Call", "Follow-up"). Clicking a chip auto-fills the textarea with a short template and the booker can edit from there.

---

### Step 4 — Review & Confirm

A clean summary panel appears at the bottom of the form before submission. It shows all selected options in a read-only review card:

- Date & Time (in booker's timezone)
- Duration
- Meeting Location (and address / phone / video link details)
- Attendees list
- Description preview
- A large, prominent **"Confirm Booking"** button (CTA). Disabled until all required fields are filled.
- An inline privacy note: *"Your details are only shared with [HOST_NAME] and used to manage this appointment."*
- **UX Enhancement:** Show a live summary panel that updates in real time as the user fills the form — positioned as a sticky sidebar on desktop or as a collapsible summary bar on mobile.

---

## 6. Post-Booking Experience

### 6.1 Confirmation Screen

On successful submission, replace the booking form with a full-screen confirmation state (no page reload — animate transition):

- Checkmark animation (Lottie or CSS).
- Human-readable summary: "You're booked! The host will see you on [Day, Date] at [Time TZ]."
- "Add to Calendar" buttons: Google Calendar, Apple Calendar (ICS download), Outlook.
- "Share booking details" button — copies a plain-text summary to clipboard.
- "Book another time" link (starts flow fresh).

### 6.2 Confirmation Email (to Booker)

Sent immediately on booking.

- Contains: date, time (booker's TZ), duration, location details, attendee list, description, the host's contact info.
- Attached `.ics` calendar file.
- "Cancel or Reschedule" button linking to a unique token-based URL (no login required).

### 6.3 Notification to the Host

- Instant email notification sent from [HOST_EMAIL] via Gmail API with full booking details.
- SMS notification to the host's phone via Twilio sent simultaneously with the email.
- Calendar event auto-created in the host's Google Calendar.

### 6.4 Reminder Emails & SMS

- 24 hours before the meeting: email reminder (via Gmail API) to both the host and the booker, plus SMS reminder to the host via Twilio.
- 1 hour before the meeting: email reminder (via Gmail API) to both the host and the booker, plus SMS reminder to the host via Twilio.

### 6.5 Cancellation & Reschedule Flow

- Unique cancel/reschedule link in every confirmation email (token-based, no login).
- **Cancellation:** booker confirms intent, both parties receive cancellation email, slot reopens.
- **Reschedule:** shows the same booking calendar UI but pre-populated. Booker selects a new time; both parties receive updated invitations.
- The host can set a cancellation policy notice period (e.g., cannot cancel within 2 hours of meeting) configurable in admin.

---

## 7. How the Host Manages Availability (No Admin Panel Required)

Rather than building a separate admin panel, The host manages everything directly in Google Calendar — a tool he likely already uses daily. The application reads from and writes to Google Calendar exclusively, making it the single source of truth.

### 7.1 Setting Availability — Google Calendar "Working Hours"

The host enables the native **Working Hours** feature in Google Calendar settings (Settings → Working Hours & Location). The application reads these hours via the Google Calendar API to determine when slots can be offered to bookers. No configuration UI is needed.

### 7.2 Blocking Time — Just Add a Calendar Event

To block off time (vacation, personal appointments, focus time), The host simply creates an event in Google Calendar as he normally would. The application checks for any existing events via the Google Calendar **Freebusy API** and hides those slots from bookers automatically. No "blocked dates" feature needs to be built.

### 7.3 New Bookings — Written Directly to Google Calendar

When a booking is confirmed, the application creates a Google Calendar event on the host's calendar with:

- Event title: "[Booker Name] — [Duration] [Meeting Type]" (e.g., "Jane Smith — 30 Min Zoom")
- Date and time
- Description: meeting purpose, all attendee names and emails, location details, backup phone if provided
- A unique cancellation/reschedule token stored in the event's `extendedProperties` (private metadata field) — this is how the app identifies and modifies the booking later without a database

### 7.4 Cancellations & Rescheduling — Update the Calendar Event

- **Cancel:** The application deletes the Google Calendar event. The slot reopens immediately.
- **Reschedule:** The application updates the existing event's date/time. No new event is created; the same event record is mutated, preserving the cancellation token.

### 7.5 App Configuration — Environment Variables Only

Settings are stored as environment variables on Render.com. The host or the developer sets these once at setup:

| Variable | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account identifier for Google API auth |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Private key for Google API auth |
| `GOOGLE_CALENDAR_ID` | [HOST_EMAIL] |
| `GMAIL_USER` | [HOST_EMAIL] — email address used for all sending |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio authentication token |
| `TWILIO_FROM_NUMBER` | Twilio phone number SMS messages are sent from |
| `HOST_PHONE_NUMBER` | the host's mobile number for SMS notifications |
| `SENTRY_DSN` | Sentry project DSN for error monitoring |
| `DEFAULT_LOCATION` | Pre-selected meeting type on page load (e.g., "zoom") |
| `DEFAULT_ADDRESS` | the host's in-person meeting address |
| `CONTACT_EMAIL` | [HOST_EMAIL] — shown in empty-state and footer |
| `CRON_SECRET` | Secret token to protect the reminders cron route from unauthorized calls |

Working hours, buffer times, and blocked dates are **not** configured here — they are managed exclusively in Google Calendar.

---

## 8. Recommended UX Enhancements (PM Recommendations)

Based on research of leading scheduling platforms (Calendly, Cal.com, SavvyCal), the following additions would significantly improve conversion rate and user satisfaction beyond the original requirements.

### 8.1 Smart Availability Preview

Display an "Available this week" teaser on page load — before the user has selected a duration — showing a simple count like "12 slots available this week." This immediately signals that the page is live and not stale, reducing bounce.

### 8.2 One-Tap Suggested Times

Show 3 suggested times at the top of the time slot column labeled "Popular times" or "Suggested" based on times The host is most frequently booked. This reduces decision fatigue and accelerates the booking.

### 8.3 Conflict-Free Phone Number Validation

For Phone Call meetings, validate the phone number format in real-time with a flag-based country code selector (international callers are common). Show a note: "The host will call this number at the scheduled time — make sure it's correct!" to reduce no-shows due to wrong numbers.

### 8.4 Persona / Intent Pre-Qualification (Optional)

An optional first question before the duration selector: "What best describes you?" with options like Client, Partner, Press, Personal. The host can configure different availability windows or meeting types per intent category. No routing logic required for v1 — just metadata tagging on the booking for the host's visibility.

### 8.5 Dark Mode Support

Respect the user's operating system color scheme preference (`prefers-color-scheme` media query). Dark mode is now expected by a significant portion of users and has become a standard expectation for quality web apps.

### 8.6 No-Show / Late Buffer Message

If the host does not join within 5 minutes of a scheduled video call, automatically send the booker a "The host is running a few minutes late" holding message via email. This requires no user interaction and reduces meeting abandonment. The timing threshold is configurable in admin.

### 8.7 Booking Link Personalization

Allow the host to share pre-filled links — e.g., ``[HOST_DOMAIN]/book?duration=30&type=zoom` — that pre-select specific options when a booker arrives. Useful for email signatures, different client contexts, or campaigns.

### 8.8 Accessibility & Internationalization

- Full keyboard navigation for the calendar and form.
- ARIA labels on all interactive elements.
- Screen reader announcement on time slot selection.
- Support for right-to-left languages (CSS logical properties).

---

## 9. Data Model (Google Calendar as Source of Truth)

There is no database. All booking data lives in Google Calendar. The table below maps logical data concepts to how they are stored.

| Logical Concept | Stored As |
|---|---|
| **Booking** | A Google Calendar event on the host's calendar |
| **Attendees** | Google Calendar event `attendees` list + event description |
| **Meeting location & type** | Google Calendar event `location` field and description |
| **Availability rules** | Google Calendar Working Hours setting (read via API) |
| **Blocked time** | Any existing Google Calendar event (read via Freebusy API) |
| **Cancellation token** | Google Calendar event `extendedProperties.private.token` |
| **App configuration** | Vercel environment variables |

### Key Google Calendar API Calls

| Operation | API Method |
|---|---|
| Check availability | `POST /freebusy` |
| List the host's working hours | `GET /calendars/{id}/settings` |
| Create a booking | `POST /calendars/{id}/events` |
| Cancel a booking | `DELETE /calendars/{id}/events/{eventId}` |
| Reschedule a booking | `PATCH /calendars/{id}/events/{eventId}` |
| Look up a booking by token | `GET /calendars/{id}/events` with `privateExtendedProperty` filter |

---

## 10. Approved Technical Stack

| Layer | Service | Rationale |
|---|---|---|
| **Frontend** | React + TypeScript + Tailwind CSS + shadcn/ui | Component library provided; consistent with design spec |
| **Backend / API** | Next.js App Router (API Routes) | Thin serverless API layer; no server to manage |
| **Data storage** | Google Calendar (via Google Calendar API) | Zero-database architecture; the host already uses it |
| **Email** | Gmail API ([HOST_EMAIL]) | Sends as the host; no third-party email service needed |
| **SMS** | Twilio | Approved service; SMS notifications and reminders to the host |
| **Error monitoring** | Sentry | Approved service; captures errors across frontend and API routes |
| **Hosting & Cron** | Render.com | Approved service; hosts the app and runs the reminder cron job natively |
| **Payments** | Stripe | Approved service; scoped to v2 (paid consultations) |
| **Auth** | Clerk | Approved service; scoped to v2 (if an admin panel is added) |
| **Calendar / Auth** | Google Cloud (free tier) | Required for Google Calendar API and Gmail API — no approved service replaces this |
| **Timezone DB** | `date-fns-tz` / `Luxon` | IANA timezone support |

### What This Architecture Eliminates

Compared to a traditional approach, this stack requires no:

- Database (PostgreSQL, MySQL, etc.) and ORM
- Separate admin panel or admin authentication
- Third-party transactional email service
- Persistent server — Next.js runs as serverless functions on Render.com

---

## 11. Edge Cases & Error Handling

### 11.1 Race Condition on Slot Selection

Two users could select the same time slot simultaneously. Because there is no database lock to rely on, the application must handle this at the Google Calendar API level: when a booking is created, immediately re-query the Freebusy API to confirm the slot is still free before returning a success response to the user. If the slot was taken in the gap, return an error and prompt the user to choose another time: "Sorry, that time was just taken! Please choose another slot."

### 11.2 Google Calendar API Failure

If the Google Calendar API is unreachable when a user tries to book, surface a clear error message: "We're having trouble confirming your booking. Please try again in a moment." Do not show a success state. The application should retry the API call up to 2 times with exponential backoff before surfacing the error.

### 11.3 No Available Slots

If the host has no available slots within the booking window, show a tasteful empty state: "The host is fully booked right now. Check back soon, or reach out directly at [email]."

### 11.4 Invalid Timezone

If browser timezone detection fails, default to UTC and prominently show a timezone selector so the user can set it correctly before seeing any times.

### 11.5 Email Delivery Failure

If the Gmail API call to send the confirmation email fails, display the booking details on-screen with instructions to screenshot or copy them. The Google Calendar event will already exist at this point, so the booking is not lost — only the email notification failed. Log the failure for the host to follow up manually.

### 11.6 Invalid or Expired Cancellation Token

If a booker uses a cancel/reschedule link with a token that does not match any event (expired, already cancelled, or tampered), show a clear message: "This link is no longer valid. The appointment may have already been cancelled or rescheduled." Provide the host's contact email for manual resolution.

---

## 12. Decisions & Configuration

All open questions have been resolved. The table below serves as the definitive record of product decisions for the developer.

| # | Question | Decision |
|---|---|---|
| 1 | What Google account should the app connect to? | **[HOST_EMAIL]** — grant the Service Account access to this account for both Google Calendar and Gmail |
| 2 | Should the booking page be publicly listed, or only accessible via direct link? | **Private** — accessible via direct link only; no search engine indexing (`noindex` meta tag required) |
| 3 | Should confirmation emails send from the host's personal Gmail or a separate address? | **[HOST_EMAIL]** — send directly via Gmail API, no alias or custom domain needed |
| 4 | Should all bookings be auto-confirmed, or should the host be able to approve/reject? | **Auto-confirmed** — bookings are confirmed instantly on submission, no approval step |
| 5 | Is there a cancellation policy? | **None** — bookers can cancel or reschedule at any time, right up until the meeting |
| 6 | Should the page have the host's photo, bio, and branding? | **Name only** — display "[HOST_NAME]" on the booking page; no photo, bio, or additional branding |
| 7 | How are working hours and buffer time managed? | **Google Calendar exclusively** — the app reads Working Hours and Freebusy data from Google Calendar; The host manages all availability directly there |
| 8 | Are paid consultations needed in v2? | **Yes** — Stripe is an approved service; introduce alongside a database and Clerk auth in v2 |
| 9 | Is an admin panel needed in v1? | **No** — Google Calendar handles all availability management; Clerk scoped to v2 |
| 10 | Should SMS notifications be included in v1? | **Yes** — Twilio approved; The host receives SMS for new bookings and reminders |

### Developer Notes from Decisions

- Add `<meta name="robots" content="noindex, nofollow">` to the booking page.
- No working hours or buffer time environment variables needed — Google Calendar is the sole source of truth.
- Wrap all API routes and key frontend interactions with Sentry for error capture from day one.
- Structure the codebase so that Supabase (database), Stripe (payments), and Clerk (auth/admin) can be introduced in v2 without a rewrite. Keep booking logic modular.
- All email sending routes through the Gmail API using [HOST_EMAIL] — no third-party email service.

---

## 13. High-Level Acceptance Criteria

The following must be true before v1.0 is considered complete and shippable:

- A user can complete a full booking (duration → date → time → details → confirm) without any page reload.
- Booked time slots become immediately unavailable to other bookers (reflected via Google Calendar Freebusy API).
- A Google Calendar event is created on the host's calendar ([HOST_EMAIL]) within 5 seconds of a confirmed booking.
- Confirmation email with `.ics` attachment is sent from [HOST_EMAIL] via Gmail API within 60 seconds of booking.
- The host receives a Gmail notification at [HOST_EMAIL] within 60 seconds of any new booking.
- The cancel/reschedule link in the confirmation email correctly identifies and modifies the corresponding Google Calendar event.
- Blocking time in Google Calendar (adding any event) correctly removes those slots from the booking UI.
- The booking page returns a `noindex, nofollow` robots meta tag and is not publicly listed in search engines.
- The booking page displays "[HOST_NAME]" as the only branding element — no photo or bio.
- Bookings are confirmed instantly with no approval step.
- Bookers can cancel or reschedule at any time with no policy restrictions enforced by the app.
- The booking page is fully functional on Chrome, Firefox, and Safari (desktop and mobile).
- Lighthouse scores: Performance > 85, Accessibility > 90, Best Practices > 90 on mobile.
- No bookings can be placed outside of the host's availability as defined in Google Calendar.
- The application has no database dependency — all state lives in Google Calendar and environment variables.

---

*End of Document — Version 1.0 — [HOST_NAME] Appointment Scheduler PRD*
