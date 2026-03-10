# Phase 4 — Google OAuth2 Setup & Calendar API Integration

**Status:** ⬜ Not started
**Depends on:** Phase 3 signed off
**Reference:** `PRD.md` Section 8.5 (Environment Variables + OAuth2 note), Section 10 (Data Model), Section 12 (Edge Cases)

---

## Goal

Establish a working, tested connection to the host's Google Calendar using OAuth2 credentials. Build and verify all five booking API routes. No UI — confirm everything works via direct API calls or a temporary test script.

---

## Deliverable

Five tested Next.js API route handlers that correctly read from and write to the host's Google Calendar. A test booking created via the API must appear in the host's Google Calendar. Blocking time in Google Calendar must correctly disappear from the availability response.

---

## Part A — OAuth2 Setup (One-Time)

Complete these steps before writing any API routes. The output is a valid `GOOGLE_REFRESH_TOKEN` stored in `.env.local` and in Render.com.

### Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the following APIs:
   - Google Calendar API
   - Gmail API
4. Create OAuth2 credentials:
   - Type: **Web Application**
   - Add `http://localhost:3000` as an authorised redirect URI (for the local token capture script)
5. **Publish the OAuth app to Production status** — go to OAuth consent screen → Publishing status → Publish App. This prevents the refresh token from expiring after 7 days. An "unverified app" warning will appear during the consent flow — this is expected and fine since only the host completes this flow.
6. Download the client credentials JSON
7. Write a local one-time script (`scripts/get-tokens.ts` or `.js`) that:
   - Starts a local OAuth2 flow using the client credentials
   - Opens the consent URL in the browser
   - Captures the authorization code from the redirect
   - Exchanges it for access and refresh tokens
   - Prints the refresh token to the console
8. Run the script, complete the consent flow as `[HOST_EMAIL]`
9. Copy the refresh token into `.env.local` as `GOOGLE_REFRESH_TOKEN`
10. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local`
11. Add all three values to Render.com environment variables
12. **Do not commit the credentials JSON or the refresh token to the repository**

### Token Exchange Helper

Create `lib/google-auth.ts` — a shared helper that all API routes use to obtain a valid access token:

```typescript
// lib/google-auth.ts
// Uses GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN from env
// Returns a fresh access token, handling refresh automatically
// Export a pre-configured google auth client for reuse across routes
```

---

## Part B — API Routes

Build the following five route handlers in `app/api/`. All routes must:
- Use the shared `lib/google-auth.ts` helper for authentication
- Be wrapped with Sentry error capture
- Return clear, structured JSON responses
- Return appropriate HTTP status codes

### Route 1 — `GET /api/availability`

**Purpose:** Return available time slots for a given date range and duration.

**Query parameters:**
- `date` — ISO date string (e.g., `2026-03-10`)
- `duration` — minutes (15, 30, 60, or 120)
- `timezone` — IANA timezone string (e.g., `America/New_York`)

**Logic:**
1. Call Google Calendar Freebusy API (`POST /freebusy`) for the requested date range using `GOOGLE_CALENDAR_ID`
2. Read the host's Working Hours from Google Calendar settings
3. Generate candidate slots at 15-minute increments within working hours
4. Filter out any slots that overlap with existing busy periods
5. Filter out any slots where the full duration does not fit before working hours end
6. Return the available slots in the booker's requested timezone

**Response shape:**
```json
{
  "date": "2026-03-10",
  "timezone": "America/New_York",
  "duration": 30,
  "slots": ["09:00", "09:30", "10:00"]
}
```

---

### Route 2 — `POST /api/bookings`

**Purpose:** Create a new booking as a Google Calendar event.

**Request body:**
```json
{
  "startTime": "2026-03-10T14:00:00Z",
  "duration": 30,
  "timezone": "America/New_York",
  "locationType": "zoom",
  "locationDetails": "",
  "bookerName": "Jane Smith",
  "bookerEmail": "jane@example.com",
  "additionalAttendees": [{ "name": "Bob", "email": "bob@example.com" }],
  "description": "Discussing Q2 roadmap"
}
```

**Logic:**
1. **Re-query Freebusy immediately** before creating the event to confirm the slot is still available. If it is no longer available, return a 409 with message: `"Sorry, that time was just taken! Please choose another slot."`
2. Generate a UUID v4 cancellation token
3. Create a Google Calendar event on `GOOGLE_CALENDAR_ID` with:
   - Title: `"[Booker Name] — [Duration] Min [Meeting Type]"` (e.g., `"Jane Smith — 30 Min Zoom"`)
   - Start and end times
   - Description: formatted block containing all booking details (booker name, email, additional attendees, location details, backup phone if provided, meeting description)
   - `extendedProperties.private.token`: the UUID v4 cancellation token
4. Return the created event ID and cancellation token

**Response shape:**
```json
{
  "eventId": "abc123",
  "token": "uuid-v4-here",
  "startTime": "2026-03-10T14:00:00Z",
  "duration": 30
}
```

**Error responses:**
- `409` — slot no longer available (race condition)
- `503` — Google Calendar API unreachable (retry up to 2 times with exponential backoff before returning this)

---

### Route 3 — `GET /api/bookings/[token]`

**Purpose:** Look up a booking by its cancellation token.

**Logic:**
1. Query Google Calendar events on `GOOGLE_CALENDAR_ID` filtering by `privateExtendedProperty: token=[token]`
2. If no event found, return 404
3. Return the event details

**Response shape:**
```json
{
  "eventId": "abc123",
  "token": "uuid-v4-here",
  "startTime": "2026-03-10T14:00:00Z",
  "duration": 30,
  "locationType": "zoom",
  "bookerName": "Jane Smith",
  "bookerEmail": "jane@example.com"
}
```

---

### Route 4 — `PATCH /api/bookings/[token]`

**Purpose:** Reschedule an existing booking by updating its time.

**Request body:**
```json
{
  "newStartTime": "2026-03-12T10:00:00Z",
  "timezone": "America/New_York"
}
```

**Logic:**
1. Look up the event by token (same as Route 3)
2. If not found, return 404
3. Re-query Freebusy to confirm the new slot is available — if not, return 409
4. Update the event's start and end time using `PATCH /calendars/{id}/events/{eventId}`
5. Preserve all other event fields including the cancellation token in `extendedProperties`
6. Return the updated event

---

### Route 5 — `DELETE /api/bookings/[token]`

**Purpose:** Cancel a booking by deleting the Google Calendar event.

**Logic:**
1. Look up the event by token (same as Route 3)
2. If not found, return 404
3. Delete the event using `DELETE /calendars/{id}/events/{eventId}`
4. Return 200 on success

---

## Verification Steps

After building all five routes, verify the following before signing off:

1. Call `GET /api/availability` for today's date — confirm it returns slots that match the host's working hours in Google Calendar
2. Call `POST /api/bookings` with a test booking — confirm the event appears in the host's Google Calendar with the correct title, description, and token in extendedProperties
3. Call `GET /api/bookings/[token]` with the token from step 2 — confirm it returns the booking details
4. Block the booked time in Google Calendar — call `GET /api/availability` again and confirm that slot is no longer returned
5. Call `PATCH /api/bookings/[token]` to reschedule — confirm the event updates in Google Calendar
6. Call `DELETE /api/bookings/[token]` — confirm the event is removed from Google Calendar

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] OAuth2 token exchange works without errors
- [ ] `lib/google-auth.ts` helper is in place and reusable
- [ ] All five API routes are implemented and return correct responses
- [ ] A test booking appears correctly in the host's Google Calendar
- [ ] Blocking time in Google Calendar removes it from the availability response
- [ ] Race condition check (Freebusy re-query) is implemented in `POST /api/bookings`
- [ ] Cancellation token is stored in `extendedProperties.private.token` as UUID v4
- [ ] All routes are wrapped with Sentry error capture
- [ ] OAuth2 credentials are not committed to the repository
- [ ] All credentials are set in Render.com environment variables
- [ ] Token capture script (`scripts/get-tokens`) is in `.gitignore` or clearly marked as local-only
