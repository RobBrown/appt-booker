# Work Plan
## Appointment Scheduling Application

---

| Field | Details |
|---|---|
| **Document Version** | 1.0 |
| **Date** | March 4, 2026 |
| **Status** | Active |
| **Reference PRD** | PRD.md |
| **Guiding Principle** | Build and verify one component at a time. Nothing moves forward until the current phase is reviewed and approved. |

---

## How This Work Plan Works

This Work Plan refelcts the description in Product Requirement Document (PRD.md).

Each phase produces one concrete, reviewable deliverable. The developer stops after completing a phase deliverable and waits for explicit sign-off before proceeding. Feedback is incorporated before the next phase begins.

No phase should take more than a few hours of focused work. If a phase feels too large, it should be split further.

**Phase status key:**
- ⬜ Not started
- 🔄 In progress
- ✅ Approved
- 🔁 Revisions requested

---

## Phase 1 — Wireframe Mockup ⬜

**Goal:** Establish the layout, information hierarchy, and flow of the booking page before any visual design or code is written. This is intentionally rough — boxes, labels, and arrows only. No colors, no fonts, no polish.

**Deliverable:** A single HTML file rendering a static wireframe of the full booking page. All four steps visible on one screen. Placeholder boxes where components will live. Annotations explaining each section's purpose.

**Wireframe must cover:**
- Page header ([HOST_NAME] name display)
- Step 1: Duration selector (4 cards)
- Step 2: Calendar area
  - Monthly calendar grid
  - Next 7 available days strip
  - Time slot column
  - Timezone display/editor
- Step 3: Meeting details form
  - Location type selector
  - Conditional fields (address / phone / backup phone)
  - Attendee name + email
  - Additional attendees (+/✕ rows)
  - Description textarea with character count
- Step 4: Review & confirm summary panel
- Confirmation CTA button
- Mobile layout sketch (separate section of the wireframe showing stacked layout)

**Review questions to answer at sign-off:**
1. Is the left-to-right / top-to-bottom flow logical?
2. Are all required fields present?
3. Is anything missing that should be on the page?
4. Should any sections be reordered?
5. Does the mobile stacking order feel right?

**➡ Do not proceed to Phase 2 until Phase 1 is signed off.**

---

## Phase 2 — Visual Design Mockup ⬜

**Goal:** Apply visual design to the approved wireframe. Colors, typography, spacing, and branding are defined here. Still static HTML — no interactivity or real data yet.

**Deliverable:** A polished static HTML mockup of the booking page showing the finalized visual design in both light and dark mode.

**Design decisions to make in this phase:**
- Color palette (primary, secondary, background, text, accent)
- Typography (font choices for headings, body, labels)
- Component styling (cards, buttons, inputs, calendar grid)
- Spacing and layout grid
- Dark mode variant
- "[HOST_NAME]" name treatment at the top of the page

**Review questions to answer at sign-off:**
1. Does the overall look and feel match expectations?
2. Are the duration cards visually distinct and tappable-looking?
3. Is the calendar easy to read?
4. Does the form feel approachable and not overwhelming?
5. Is the "Confirm Booking" CTA prominent enough?
6. Does the dark mode feel consistent?

**➡ Do not proceed to Phase 3 until Phase 2 is signed off.**

---

## Phase 3 — Project Scaffolding & Repository Setup ⬜

**Goal:** Create the Next.js project structure with all dependencies installed. No features built yet — just a working, deployable skeleton.

**Deliverable:** A GitHub repository with a running Next.js app that renders a placeholder page at the root route, successfully deploys to Render.com, and has all dependencies installed.

**Tasks:**
- Initialise Next.js project (App Router, TypeScript)
- Install and configure Tailwind CSS
- Install and configure shadcn/ui
- Install supporting libraries: `date-fns`, `date-fns-tz`, `lucide-react`
- Install Google API client: `googleapis`
- Install Twilio SDK: `twilio`
- Install Sentry SDK: `@sentry/nextjs`
- Set up `.env.local` template with all required variable names (values left blank):
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_SERVICE_ACCOUNT_KEY`
  - `GOOGLE_CALENDAR_ID`
  - `GMAIL_USER`
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`
  - `HOST_PHONE_NUMBER`
  - `SENTRY_DSN`
  - `DEFAULT_LOCATION`
  - `DEFAULT_ADDRESS`
  - `CONTACT_EMAIL`
  - `CRON_SECRET`
- Configure Sentry (`sentry.client.config.ts`, `sentry.server.config.ts`) — errors captured from day one
- Set up Render.com project and confirm deployment pipeline works
- Configure Render.com cron job placeholder (runs `/api/cron/reminders` — no logic yet)
- Add `noindex` meta tag to root layout
- Confirm the app builds without errors

**Review questions to answer at sign-off:**
1. Does the app build and deploy cleanly to Render.com?
2. Are all expected dependencies present in `package.json`?
3. Is the folder structure logical for the planned feature set?
4. Is Sentry receiving events from the deployed app?

**➡ Do not proceed to Phase 4 until Phase 3 is signed off.**

---

## Phase 4 — Google Calendar API Integration ⬜

**Goal:** Establish a working, tested connection to the host's Google Calendar. No UI yet — just verified API calls running in the background.

**Deliverable:** A set of tested API route handlers (Next.js Route Handlers) that successfully read from and write to [HOST_EMAIL]'s Google Calendar. Verified via a simple test page or console output — not the real UI.

**Tasks:**
- Set up a Google Cloud project
- Enable Google Calendar API and Gmail API
- Create a Service Account and grant it access to [HOST_EMAIL]
- Store Service Account credentials in `.env.local`
- Build and test the following API route handlers:

| Route | Method | Purpose |
|---|---|---|
| `/api/availability` | GET | Query Freebusy API for a given date range; return open slots |
| `/api/bookings` | POST | Create a new Google Calendar event with booking details + token in extendedProperties |
| `/api/bookings/[token]` | GET | Look up a booking by its cancellation token |
| `/api/bookings/[token]` | PATCH | Reschedule — update event date/time |
| `/api/bookings/[token]` | DELETE | Cancel — delete the calendar event |

- Verify that creating a booking via the API correctly appears in the host's Google Calendar
- Verify that the Freebusy query correctly hides slots blocked by existing calendar events

**Review questions to answer at sign-off:**
1. Do all five API routes return correct responses?
2. Does a test booking appear correctly in the host's Google Calendar?
3. Does blocking time in Google Calendar correctly disappear from the availability response?
4. Are Service Account credentials stored securely and not committed to the repository?

**➡ Do not proceed to Phase 5 until Phase 4 is signed off.**

---

## Phase 5 — Gmail & Twilio Integration ⬜

**Goal:** Establish working, tested email sending via the host's Gmail account and SMS sending via Twilio. No UI yet — triggered manually or via a test script.

**Deliverable:** Tested API route handlers that send a well-formatted confirmation email with an `.ics` attachment from [HOST_EMAIL], and an SMS notification to the host's phone via Twilio.

**Tasks:**
- Build `/api/email/confirmation` POST route handler (Gmail API)
  - Email sent from [HOST_EMAIL] to the booker
  - Must include: date and time (booker's timezone), duration, meeting type, location details, all attendee names, meeting description, cancel/reschedule link
  - Generate a valid `.ics` file and attach it to the email
- Build `/api/email/notification` POST route handler (Gmail API)
  - Email sent from [HOST_EMAIL] to [HOST_EMAIL] (the host's internal notification)
  - Must include all booking details
- Build `/api/sms/notification` POST route handler (Twilio)
  - SMS sent to the host's phone (`HOST_PHONE_NUMBER`) on new booking
  - Message format: "New booking: [Name] — [Date] at [Time] — [Duration] [Meeting Type]"
- Wrap all three route handlers with Sentry error capture
- Test all three end-to-end:
  - Confirmation email arrives promptly and renders correctly
  - `.ics` file opens correctly in Google Calendar and Apple Calendar
  - Cancel/reschedule link contains the correct token
  - the host's notification email contains all booking details
  - the host's SMS arrives promptly and is clearly formatted

**Review questions to answer at sign-off:**
1. Does the confirmation email arrive promptly and render correctly?
2. Does the `.ics` file open correctly and create an event in Google Calendar / Apple Calendar?
3. Does the cancel/reschedule link in the email contain the correct token?
4. Does the host's notification email contain all the booking details he needs?
5. Does the host's SMS arrive promptly with the correct information?

**➡ Do not proceed to Phase 6 until Phase 5 is signed off.**

---

## Phase 6 — Booking Page UI (Static, No API) ⬜

**Goal:** Build the full interactive booking page UI using the approved visual design from Phase 2. At this stage, the UI uses hardcoded mock data — no real API calls yet.

**Deliverable:** A fully interactive booking page at the root route (`/`) that walks through all four steps using mock availability data. Visually matches the Phase 2 approved design exactly.

**Tasks:**
- Implement Step 1: Duration selector cards with selection state
- Implement Step 2:
  - Monthly calendar grid with mock available/unavailable days
  - Next 7 available days chip strip
  - Time slot column with 12h/24h toggle
  - Timezone display with editable dropdown (IANA timezone list)
  - Morning / afternoon / evening slot grouping
  - "Next available" badge on nearest open date
- Implement Step 3:
  - Location type segmented selector with conditional field logic
    - In Person → address field
    - Phone Call → phone number field (hide backup phone)
    - Virtual → backup phone field (optional)
  - Attendee name + email fields
  - Additional attendees +/✕ repeating rows (max 10)
  - Description textarea with live character counter
  - Quick-select topic chips above textarea
- Implement Step 4:
  - Live summary panel (sticky sidebar desktop / collapsible bar mobile)
  - Review card with all selections
  - "Confirm Booking" CTA (disabled until required fields filled)
  - Privacy note
- Implement confirmation screen (post-submit state with animation)
- Implement full responsive layout (mobile stacking order per wireframe)
- Implement dark mode (respects `prefers-color-scheme`)

**Review questions to answer at sign-off:**
1. Does the page flow feel natural from top to bottom?
2. Do all conditional fields appear and disappear correctly?
3. Does the live summary panel update correctly as fields are filled?
4. Is the "Confirm Booking" button correctly disabled/enabled?
5. Does the mobile layout feel comfortable to use on a phone?
6. Does dark mode look correct?

**➡ Do not proceed to Phase 7 until Phase 6 is signed off.**

---

## Phase 7 — Connect UI to API (Live Booking Flow) ⬜

**Goal:** Replace all mock data in the booking page with real API calls. A complete booking made on the page should create a real Google Calendar event, send real emails via Gmail, and send a real SMS to the host via Twilio.

**Deliverable:** A fully functional end-to-end booking flow. A test booking made on the live page creates an event in the host's Google Calendar, sends a confirmation email from [HOST_EMAIL] to the booker, sends a notification email to the host, and sends an SMS to the host's phone.

**Tasks:**
- Replace mock availability data with live calls to `/api/availability`
- On "Confirm Booking" submit:
  - Call `POST /api/bookings` to create the Google Calendar event
  - Call `POST /api/email/confirmation` to send the booker's confirmation email via Gmail API
  - Call `POST /api/email/notification` to notify the host via Gmail API
  - Call `POST /api/sms/notification` to notify the host via Twilio SMS
  - On success: transition to confirmation screen
  - On failure: show inline error message, do not transition
- Implement race condition handling: re-query Freebusy immediately before creating the booking; if slot is taken, show "Sorry, that time was just taken" message and refresh available slots
- Implement loading states on all async actions (button spinner, slot loading skeleton)
- Implement error states for API failures (user-friendly messages, no raw errors exposed)
- Confirm Sentry is capturing any errors thrown during the booking flow
- Verify the `noindex` meta tag is present and correct

**Review questions to answer at sign-off:**
1. Does a completed booking appear correctly in the host's Google Calendar?
2. Does the booker receive a confirmation email from [HOST_EMAIL] with the correct details and `.ics` attachment?
3. Does the host receive a notification email at [HOST_EMAIL]?
4. Does the host receive an SMS notification via Twilio?
5. Does blocking a time in Google Calendar immediately remove it from the available slots?
6. Do loading and error states display correctly?

**➡ Do not proceed to Phase 8 until Phase 7 is signed off.**

---

## Phase 8 — Cancellation & Reschedule Flow ⬜

**Goal:** Build the cancel and reschedule experience that is accessed via the link in the confirmation email.

**Deliverable:** A working cancel/reschedule page at `/manage/[token]` that correctly identifies the booking, allows the booker to cancel or pick a new time, and updates Google Calendar accordingly.

**Tasks:**
- Build `/manage/[token]` page:
  - On load: call `GET /api/bookings/[token]` to fetch and display the existing booking details
  - Show two options: "Cancel this booking" and "Reschedule"
  - Handle invalid/expired token gracefully (show error message with the host's contact email)
- **Cancel flow:**
  - Show confirmation prompt ("Are you sure you want to cancel?")
  - On confirm: call `DELETE /api/bookings/[token]`
  - Send cancellation emails to both the booker and the host via Gmail API
  - Send cancellation SMS to the host via Twilio
  - Show cancellation confirmation screen
- **Reschedule flow:**
  - Show the same calendar/time slot UI as the booking page, pre-populated with existing booking details
  - On new time selection and confirm: call `PATCH /api/bookings/[token]`
  - Send reschedule confirmation emails to both the booker and the host via Gmail API with updated `.ics` attachment
  - Send reschedule SMS to the host via Twilio
  - Show reschedule confirmation screen
- Wrap all route handlers with Sentry error capture
- Style the `/manage` page to match the booking page visual design

**Review questions to answer at sign-off:**
1. Does the cancel link in the confirmation email correctly load the booking details?
2. Does cancelling a booking delete the event from the host's Google Calendar?
3. Does rescheduling correctly update the existing calendar event (not create a new one)?
4. Do both the booker and the host receive correct emails for both cancel and reschedule actions?
5. Does the host receive an SMS for both cancel and reschedule actions?
6. Does an invalid token show a helpful error message?

**➡ Do not proceed to Phase 9 until Phase 8 is signed off.**

---

## Phase 9 — Reminder Emails & SMS ⬜

**Goal:** Implement automated reminder emails and SMS messages sent 24 hours and 1 hour before each booked meeting.

**Deliverable:** A Render.com Cron Job that runs hourly, checks for upcoming bookings in Google Calendar, and sends reminder emails via Gmail API and reminder SMS via Twilio at the correct intervals.

**Tasks:**
- Build `/api/cron/reminders` POST route handler
- Logic: query Google Calendar for events in the next 25 hours; identify events approximately 24 hours away (±30 min window) and approximately 1 hour away (±15 min window); for each, send reminder emails and SMS
- **24-hour reminder:**
  - Email to booker (Gmail API): "Your meeting with [HOST_NAME] is tomorrow at [time]" + full details + cancel/reschedule link
  - Email to the host (Gmail API): "Reminder: [Name] tomorrow at [time]" + full details
  - SMS to the host (Twilio): "Reminder: [Name] — tomorrow at [Time] — [Duration] [Meeting Type]"
- **1-hour reminder:**
  - Email to booker (Gmail API): "Your meeting with [HOST_NAME] starts in 1 hour at [time]" + full details
  - Email to the host (Gmail API): "Starting in 1 hour: [Name] at [time]"
  - SMS to the host (Twilio): "Starting in 1 hour: [Name] — [Time] — [Meeting Type]"
- Protect the cron route using the `CRON_SECRET` environment variable — reject any request without the correct secret header
- Configure Render.com Cron Job to call this route every hour with the secret header
- Wrap the route handler with Sentry error capture
- Test by manually triggering the route and verifying emails and SMS are sent correctly

**Review questions to answer at sign-off:**
1. Are reminder emails sent at the correct 24h and 1h intervals?
2. Do both the booker and the host receive reminder emails?
3. Does the host receive reminder SMS messages via Twilio?
4. Is the cron route protected from unauthorized access?
5. Is Sentry capturing any cron failures?

**➡ Do not proceed to Phase 10 until Phase 9 is signed off.**

---

## Phase 10 — QA, Performance & Launch ⬜

**Goal:** Harden the application, verify all acceptance criteria from the PRD, and prepare for launch.

**Deliverable:** A production-ready application that passes all PRD acceptance criteria and Lighthouse benchmarks.

**Tasks:**

**Cross-browser testing:**
- Test full booking flow on Chrome (desktop + mobile)
- Test full booking flow on Firefox (desktop + mobile)
- Test full booking flow on Safari (desktop + mobile)
- Test cancel and reschedule flows on all three browsers

**Acceptance criteria verification (from PRD Section 13):**
- ✅ Full booking flow completes without page reload
- ✅ Booked slots become unavailable immediately
- ✅ Google Calendar event created within 5 seconds
- ✅ Confirmation email sent from [HOST_EMAIL] within 60 seconds
- ✅ the host's notification email and Twilio SMS sent within 60 seconds
- ✅ Cancel/reschedule link works correctly
- ✅ Blocking time in Google Calendar removes slots from UI
- ✅ `noindex` meta tag present and verified
- ✅ "[HOST_NAME]" is the only branding on the page
- ✅ Bookings are auto-confirmed with no approval step
- ✅ No cancellation policy enforced
- ✅ No database dependency

**Performance & accessibility:**
- Run Lighthouse on mobile — confirm Performance > 85, Accessibility > 90, Best Practices > 90
- Fix any Lighthouse failures before launch
- Verify full keyboard navigation of the booking form
- Verify screen reader compatibility (VoiceOver on Safari, NVDA on Chrome)

**Security checks:**
- Confirm Service Account key is not committed to the repository
- Confirm cron route rejects requests without the correct `CRON_SECRET` header
- Confirm cancellation tokens are sufficiently random (UUID v4 minimum)
- Confirm no sensitive booking data is exposed in client-side JavaScript bundles
- Confirm Sentry is not logging any personally identifiable information (PII)

**Sentry review:**
- Review Sentry dashboard for any errors surfaced during QA
- Resolve all Sentry issues before launch
- Confirm error alerts are configured to notify the host's email

**Launch:**
- Point production domain to Render.com deployment
- Confirm all environment variables are correctly set in Render.com dashboard
- Send the host a test booking link and confirm the full flow works on production
- Confirm The host can see bookings appearing correctly in his Google Calendar
- Confirm The host receives email and SMS notifications on production

**Review questions to answer at sign-off:**
1. Do all PRD acceptance criteria pass?
2. Do Lighthouse scores meet targets on mobile?
3. Does the full flow work correctly in production?
4. Is the host receiving email and SMS notifications correctly?
5. Is the host comfortable with how bookings appear in his Google Calendar?
6. Is Sentry showing a clean error dashboard?

**✅ Launch complete.**

---

## Phase Summary

| Phase | Name | Deliverable |
|---|---|---|
| 1 | Wireframe Mockup | Static HTML wireframe of full booking page |
| 2 | Visual Design Mockup | Polished static HTML design in light + dark mode |
| 3 | Project Scaffolding | Running Next.js app deployed to Render.com with Sentry configured |
| 4 | Google Calendar API | Tested API routes for availability + booking CRUD |
| 5 | Gmail & Twilio Integration | Tested confirmation emails, notification emails, and SMS |
| 6 | Booking Page UI | Full interactive UI with mock data |
| 7 | Live Booking Flow | UI connected to real APIs; end-to-end booking works |
| 8 | Cancel & Reschedule | `/manage/[token]` page fully functional |
| 9 | Reminder Emails & SMS | Render.com cron job sending 24h and 1h reminders via Gmail and Twilio |
| 10 | QA & Launch | All acceptance criteria verified; production live on Render.com |

---

*End of Document — Version 1.0 — [HOST_NAME] Appointment Scheduler Work Plan*
