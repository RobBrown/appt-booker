# Phase 1 — Wireframe Mockup

**Status:** ⬜ Not started
**Depends on:** Nothing — this is the first phase.
**Reference:** `PRD.md` Section 5 (Core Booking Flow), Section 6 (Post-Booking Experience)

---

## Goal

Produce a static HTML wireframe of the full booking page. This is layout and hierarchy only — no colors, no fonts, no polish. Boxes, labels, and annotations. The purpose is to establish the information architecture and confirm all required elements are present before any visual design or code is written.

---

## Deliverable

A single file: `wireframe.html`

Render a complete wireframe of the booking page in a browser. All four steps must be visible. Use placeholder boxes, labels, and arrows. Annotate each section with its purpose. Include a separate mobile layout section at the bottom of the page showing the stacked mobile order.

---

## Required Elements

Every element listed below must appear in the wireframe. Do not omit any.

### Page Header
- `[HOST_NAME]` — name display only, no photo or bio

### Step 1 — Duration Selector
- Four side-by-side cards: 15 Minutes / 30 Minutes / 60 Minutes / 2 Hours
- Hint text placeholder beneath each card
- Selected state indicator

### Step 2 — Calendar Area
- Monthly calendar grid
  - Day cells with available / unavailable states indicated
  - Previous / Next month navigation
  - "Next available" badge placeholder
- Next 7 available days strip (horizontal scrollable pill chips)
- Time slot column
  - Morning / Afternoon / Evening group headers
  - 12h / 24h toggle
  - Individual slot items
- Timezone display field (clickable/editable label)

### Step 3 — Meeting Details Form
- Location type selector (6 options: In Person / Phone Call / Zoom / Google Meet / WebEx / Jitsi Meet)
- Conditional field area:
  - Address field (shown for In Person)
  - Phone number field (shown for Phone Call)
  - Backup phone field (shown for virtual options)
- Attendee section:
  - Your Name field
  - Your Email field
  - Additional attendees repeating rows (+/✕)
  - Attendee count badge
- Description textarea
  - Topic chip row above
  - Character counter below

### Step 4 — Review & Confirm
- Live summary panel (sticky sidebar on desktop)
  - Date & Time
  - Duration
  - Location
  - Attendees
  - Description preview
- "Confirm Booking" CTA button (prominent, full-width or large)
- Privacy note beneath the button

### Confirmation Screen (post-submit state)
- Checkmark / success indicator
- Summary text placeholder
- "Add to Calendar" buttons (Google / Apple / Outlook)
- "Share booking details" button
- "Book another time" link

### Mobile Layout (separate section)
- Show the stacked vertical order of all elements for a narrow screen
- Annotate any components that behave differently on mobile (e.g., summary panel becomes collapsible bar, calendar and time slots stack vertically)

---

## Annotations

Each section of the wireframe must include a brief annotation explaining its purpose. Example: "Time slot column — appears after date is selected. Slots filtered by selected duration."

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] All four steps are visible on one screen
- [ ] All required elements listed above are present
- [ ] Mobile layout section is included
- [ ] Each section is annotated
- [ ] No colors, no real fonts, no visual polish — layout only
- [ ] The file renders correctly in a browser without external dependencies
