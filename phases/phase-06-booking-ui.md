# Phase 6 — Booking Page UI (Static, No API)

**Status:** ⬜ Not started
**Depends on:** Phase 5 signed off
**Reference:** `PRD.md` Section 5 (Core Booking Flow), Section 6.1 (Confirmation Screen), Section 9 (UX Enhancements)

---

## Goal

Build the complete interactive booking page UI at the root route (`/`). Use hardcoded mock data — no real API calls. The UI must visually match the approved Phase 2 design exactly and implement all interactive behaviors defined in the PRD.

---

## Deliverable

A fully interactive booking page at `app/page.tsx` (and associated components) that:
- Walks through all four steps using mock availability data
- Implements all conditional field logic
- Matches the Phase 2 visual design exactly in both light and dark mode
- Works correctly on mobile (responsive layout)
- Has no real API calls — all data is hardcoded mock data

---

## Mock Data

Use the following hardcoded values for all UI development in this phase:

```typescript
// Mock available days — use a spread of available and unavailable days across the current month
// Mock time slots — a realistic set of morning/afternoon/evening slots
// Mock "next 7 available days" — 7 days starting from tomorrow
// Default timezone — detect from browser via Intl API (this is real behavior, not mocked)
```

---

## Step 1 — Duration Selector

- Four cards side-by-side on desktop, stacked on mobile: 15 Min / 30 Min / 60 Min / 2 Hours
- Each card shows the duration label and the hint text read from environment variables:
  - `DURATION_LABEL_15`, `DURATION_LABEL_30`, `DURATION_LABEL_60`, `DURATION_LABEL_120`
  - Fall back to sensible defaults if env vars are not set
- Selecting a card highlights it with the brand color
- After selection, the calendar section animates into view (do not show calendar on page load)
- Only one card can be selected at a time

## Step 2 — Date & Time Selection

### Monthly Calendar Grid
- Show current month by default
- Available days: show a subtle dot indicator below the date number
- Unavailable days: greyed out, non-interactive
- Past days: greyed out, non-interactive
- Selected day: highlighted with brand color
- Today: visually distinguished (underline, ring, or equivalent)
- Previous/Next month navigation arrows
- "Next available" badge on the nearest available date when no slots are available today

### Next 7 Available Days Strip
- Horizontal scrollable row of pill chips showing the next 7 mock available days (e.g., "Mon Mar 10")
- Tapping a chip selects that day AND highlights it in the monthly calendar grid
- Selecting a day in the calendar grid also updates the active chip in the strip
- The two selection states must stay in sync

### Time Slot Column
- Appears after a date is selected (below on mobile, beside on desktop)
- Group slots under "Morning", "Afternoon", "Evening" headers
- Single tap/click selects a slot and highlights it — no confirm button needed
- 12h / 24h toggle at the top of the column (persists via `localStorage`)
- Show mock slots appropriate to the selected time of day

### Timezone Display
- Detect timezone automatically on load using `new Intl.DateTimeFormat().resolvedOptions().timeZone`
- Display as a clickable label: "Showing times in: [Timezone] ✎"
- Clicking opens an inline searchable dropdown of IANA timezone strings
- All displayed times update when the timezone is changed
- If detection fails, default to UTC and show the selector prominently

## Step 3 — Meeting Details Form

Animates into view after a time slot is selected.

### Location Type Selector
- Segmented button group with icons: In Person / Phone Call / Zoom / Google Meet / WebEx / Jitsi Meet
- Default selection read from `DEFAULT_LOCATION` env var (fall back to Zoom if not set)
- Conditional field logic (all transitions are smooth — no jarring layout shifts):
  - **In Person** selected → show required address field, pre-filled with `DEFAULT_ADDRESS` env var value
  - **Phone Call** selected → show required phone number field with international format support (flag + country code selector); hide backup phone field
  - **Zoom / Google Meet / WebEx / Jitsi Meet** selected → show optional backup phone number field; hide address and primary phone fields

### Attendee Information
- **Your Name** — required, text input, max 100 characters
- **Your Email** — required, validated email format
- **Additional Attendees** — "+" button adds a new row: Full Name (required) + Email (optional)
  - Maximum 10 additional attendee rows
  - Each row has a "✕" remove button
  - Live badge updates: "2 attendees total", "3 attendees total", etc.

### Meeting Description
- Multi-line textarea, optional
- Placeholder: *"Briefly describe the purpose of this meeting and any agenda items or questions you'd like to cover."*
- Max 1,000 characters
- Live character counter: "340 / 1000"
- Topic chips above the textarea — read from `TOPIC_CHIPS` env var (comma-separated)
  - Fall back to sensible defaults if not set: "Introduction Call, Project Review, Follow-up"
  - Clicking a chip sets the textarea value to the chip label (editable from there)

## Step 4 — Review & Confirm

### Live Summary Panel
- **Desktop:** sticky sidebar that shows a summary of all current selections, updating in real time as the user fills the form
- **Mobile:** collapsible summary bar — shows a condensed one-line summary, expandable to full details
- Summary must reflect: date, time (in booker's timezone), duration, location type, attendee count

### Review Card
- Full read-only summary of all selections before submission:
  - Date & Time (in booker's timezone)
  - Duration
  - Location type and details
  - Attendee names
  - Description preview (truncated if long)

### Confirm Booking CTA
- Large, prominent button: "Confirm Booking"
- **Disabled** until all required fields are filled:
  - Duration selected
  - Date selected
  - Time slot selected
  - Your Name filled
  - Your Email filled and valid
  - Location-specific required field filled (address or phone number)
- Button becomes enabled as soon as all required fields are satisfied
- Privacy note below: *"Your details are only shared with [HOST_NAME] and used to manage this appointment."*

## Confirmation Screen

On clicking "Confirm Booking" (with mock data — no real API call):
- Animate the form out and the confirmation screen in (no page reload)
- Show a checkmark animation (CSS animation acceptable — no Lottie dependency required)
- Human-readable summary: *"You're booked. [HOST_NAME] will see you on [Day, Date] at [Time TZ]."*
- "Add to Calendar" buttons: Google Calendar (deep link), Apple Calendar (ICS download stub), Outlook (stub)
- "Share booking details" button — copies a plain-text summary to clipboard
- "Book another time" link — resets the entire form to its initial state

---

## Responsive Layout

- **Desktop (≥ 768px):** Two-column layout. Duration selector spans full width. Calendar and time slot column side by side. Summary panel as sticky sidebar alongside the form.
- **Mobile (< 768px):** Single column. Duration cards stacked vertically. Calendar full width. Time slots below calendar. Summary panel as collapsible bar. All tap targets minimum 44×44px.

---

## Accessibility Requirements

- Full keyboard navigation — all interactive elements reachable and operable via keyboard
- ARIA labels on all interactive elements (calendar days, time slots, chips, buttons)
- Screen reader announcement when a time slot is selected
- Focus management: when a step becomes active, focus moves to the first interactive element in that step

---

## Dark Mode

- Respects `prefers-color-scheme: dark` automatically
- All components must render correctly in dark mode
- Do not add a manual toggle — rely entirely on the OS preference

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] Page flow from duration → date → time → form → confirm works end-to-end with mock data
- [ ] Duration cards animate the calendar into view on selection
- [ ] Calendar and next 7 days strip stay in sync on day selection
- [ ] Time slot 12h/24h toggle works and persists via `localStorage`
- [ ] Timezone detection works; manual override via dropdown works
- [ ] All conditional location fields appear and disappear correctly
- [ ] Additional attendees rows add and remove correctly (max 10)
- [ ] Character counter updates live; chips pre-fill the textarea
- [ ] Live summary panel updates in real time on desktop
- [ ] Mobile summary bar is collapsible
- [ ] "Confirm Booking" button is disabled until all required fields are filled
- [ ] Confirmation screen animates in correctly on mock submit
- [ ] "Book another time" resets the form
- [ ] Layout is correct and comfortable on a 375px wide mobile screen
- [ ] Dark mode renders correctly
- [ ] Full keyboard navigation works
- [ ] No real API calls are made — all data is mock
