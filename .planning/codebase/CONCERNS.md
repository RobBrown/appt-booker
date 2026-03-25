# Codebase Concerns

**Analysis Date:** 2026-03-24

## Tech Debt

### Code Duplication Between API Routes and MCP Services

**Issue:** Booking service logic exists in two places with different error handling approaches.

**Files:**
- `app/api/bookings/route.ts` — original API route (208 lines)
- `lib/services/bookings.ts` — refactored service (625 lines)
- `app/api/bookings/[token]/route.ts` — manage booking route (215 lines)

**Impact:** When business logic changes, developers must update multiple places or risk divergence between the API and MCP endpoints. For example, the `findEventByToken` function is duplicated and has different parameters:
- In `app/api/bookings/[token]/route.ts` (line 22-26): only includes future events (`timeMin`)
- In `lib/services/bookings.ts` (line 64-78): includes past events for historical lookups

**Fix approach:** Complete consolidation of all booking operations to use `lib/services/bookings.ts` exclusively. The legacy API route handlers in `app/api/bookings/route.ts` and `app/api/bookings/[token]/route.ts` should become thin wrappers that call service functions and handle validation/rate-limiting.

---

### Duplicated Utility Functions Across Email Handlers

**Issue:** Email formatting helpers (`formatLocationLine`, `formatDateTimeLine`, etc.) and building logic are scattered across multiple files with slight variations.

**Files:**
- `app/api/cron/reminders/route.ts` (578 lines) — custom email builders for 24h reminders
- `app/api/email/reschedule/route.ts` (256 lines) — email builder for reschedule notifications
- `app/api/email/confirmation/route.ts` (193 lines) — confirmation email builder
- `app/api/email/cancellation/route.ts` (198 lines) — cancellation email builder
- `lib/services/bookings.ts` (625 lines) — creates confirmation and notification emails inline

**Impact:** New email templates require duplicating builder logic across routes. Bug fixes in email HTML/text formatting need to be applied in multiple places.

**Fix approach:** Create a dedicated `lib/email-builders.ts` module exporting reusable builders: `buildReminderEmail()`, `buildRescheduleEmail()`, etc. All routes should import these functions rather than reimplementing them.

---

### Inconsistent Environment Variable Defaults

**Issue:** Default values for environment variables are scattered and inconsistent.

**Files affected:**
- `app/page.tsx` (line 24-30): `HOST_NAME`, `CONTACT_EMAIL`, `DEFAULT_LOCATION` have defaults
- `lib/services/bookings.ts` (line 201-202): `HOST_NAME` defaults to "Host", `HOST_DOMAIN` defaults to ""
- `app/api/bookings/route.ts` (line 98-99): `HOST_NAME` defaults to "Host"
- `app/api/cron/reminders/route.ts` (line 407-410): `HOST_NAME` defaults to "Your host", `HOST_TIMEZONE` defaults to "America/Toronto"

**Impact:** Inconsistent fallbacks ("Host" vs "Your host"), making the app behavior unpredictable when env vars are partially set. Email templates may show different host names depending on which endpoint processes them.

**Fix approach:** Create a `lib/env-config.ts` module that centralizes all env var reads with consistent defaults. Export functions like `getHostName()`, `getHostDomain()`, `getHostTimezone()` that enforce one fallback strategy app-wide.

---

### Race Condition in Availability Check (Mitigated but Not Eliminated)

**Issue:** Between checking slot availability and creating the calendar event, another request could book the same time.

**Files:**
- `lib/services/bookings.ts` (line 188-198): Re-queries freebusy immediately before creating event but does not hold a lock
- `app/api/bookings/route.ts` (line 82-95): Same pattern

**Current mitigation:** Retries with exponential backoff (max 2 retries) if insert fails, and a 409 Conflict response tells clients to retry. The Google Calendar API itself prevents true double-bookings at the event level.

**Impact:** If two requests arrive in rapid succession for the same slot, one creates the event and one gets a 409. The client seeing 409 must prompt the user to re-check availability. This is acceptable but not seamless.

**Risk level:** Low in practice. Most users complete the booking flow in seconds, not milliseconds. The rate limiter (10 bookings per 10 minutes per IP) further reduces concurrent requests from the same source.

**Improvement path:** Implement distributed locking via Redis using the slot (calendar ID + start time) as the key. Lock before checking availability, hold for the duration of event creation, then release. This requires adding lock/unlock logic to `createBooking()` in `lib/services/bookings.ts` and handling lock acquisition timeout (retry or 503).

---

## Fragile Areas

### Email Template Rendering in Multiple Places

**Files:**
- `lib/gmail.ts` (line 41-63): Core ICS builder and MIME builder
- `lib/services/bookings.ts` (line 297-451): Builds 3-4 email templates inline for confirmation, notification, and attendee invitations
- `app/api/cron/reminders/route.ts` (line 40-108): Builds reminder emails inline
- Multiple `app/api/email/*/route.ts`: Each builds emails differently

**Why fragile:** HTML sanitization (`escapeHtml`), MIME boundary handling, and ICS formatting are easy to get wrong. If a new email type is added without calling `escapeHtml()` on user fields, XSS is possible. If MIME boundaries are malformed, the email won't parse correctly in some clients.

**Safe modification:** All email HTML building must go through the `renderEmailHtml()` function in `lib/gmail.ts`, which enforces the HTML structure and expects all dynamic content to be pre-escaped. Never call `sendEmail()` with unescaped user content.

**Test coverage:**
- `lib/__tests__/gmail.test.ts` covers `sanitizeHeader()` but NOT HTML escaping or full email rendering
- No integration tests verify that emails are actually sent with correct MIME structure

**Recommended:** Add unit tests for `escapeHtml()`, `buildMime()`, and `buildIcs()` in `lib/__tests__/gmail.test.ts`. Add integration tests that intercept `sendEmail()` calls and verify the MIME structure and HTML are correct.

---

### Dynamic Calendar Event Description Parsing

**Files:**
- `app/api/cron/reminders/route.ts` (line 22-34): Custom `parseBookingData()` function to extract structured fields from calendar event description

**Why fragile:** The booking creation logic stores structured data (booker name, email, phone, duration, etc.) in the event's `extendedProperties.private` field. But the cron reminder handler tries to extract some of this from the description text via regex. If the description format changes, parsing breaks.

**Safe modification:** The reminder handler should ONLY read from `event.extendedProperties.private`, never from the description text. Standardize on extended properties as the source of truth.

**Test coverage:** No tests for `parseBookingData()`. If the format ever changes, the reminder cron will silently fail to extract booking details.

**Recommended:** Remove reliance on description parsing. Ensure all extended properties are properly set in `lib/services/bookings.ts` and always read from them in the reminder handler.

---

### Clerk Token Verification Implementation Note

**Files:**
- `app/[transport]/route.ts` (line 54-66): Custom token verification using `@clerk/backend` instead of `@clerk/nextjs/server`

**Why unusual:** The comment explains that using `@clerk/nextjs/server` breaks response class identity checks in Turbopack's bundled context. The workaround uses a private implementation detail:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clerkAuth = (requestState as any).toAuth();
```

This relies on an internal method `toAuth()` on Clerk's `RequestState` object, which is not part of the public API.

**Risk level:** Medium. If Clerk updates their SDK and removes or changes `toAuth()`, this breaks silently or with cryptic type errors.

**Improvement path:** File an issue with Clerk or mcp-handler to either:
1. Export a public utility to convert `RequestState` to `AuthInfo`
2. Update Turbopack/Next.js to avoid the Response class split
3. Document this pattern officially in the @clerk/mcp-tools guide

**Mitigation:** Keep the `@clerk/backend` version pinned and document this workaround in a code comment with a link to the underlying issue.

---

### Unvalidated Timezone Parameter in API Routes

**Files:**
- `app/api/bookings/route.ts` (line 46): `timezone` param accepted without validation
- `lib/services/bookings.ts` (line 92): `timezone` param used directly in Calendar API calls

**Impact:** Invalid IANA timezone strings are passed to the Google Calendar API, which may reject them or use a fallback. This could cause the calendar event to be created in the wrong timezone.

**Current status:** Fixed per `.sec-exceptions.md` (R5 — "Timezone param now validated against `Intl.supportedValuesOf('timeZone')` and returns 400 on invalid input"). But reading the code, validation is missing from the actual route handlers.

**Fix approach:** Add validation to `lib/services/bookings.ts` at the top of `createBooking()` and `rescheduleBooking()`:

```typescript
if (!Intl.supportedValuesOf('timeZone').includes(timezone)) {
  throw new Error(`Invalid timezone: ${timezone}`);
}
```

---

## Performance Bottlenecks

### Full Calendar Scan on Every Booking Creation

**Files:**
- `lib/services/bookings.ts` (line 189-194): Calls `getBusyPeriods()` which queries `freebusy` API
- `lib/availability.ts` (line 93-142): `getBusyPeriods()` makes TWO API calls:
  1. `calendar.freebusy.query()` to get busy times
  2. `calendar.events.list()` with `showDeleted: false` to filter all-day events

**Impact:** Every booking creation triggers 2 Google Calendar API calls (minimum). On peak load, this can quickly hit Google's API rate limits (200 qps per project).

**Scaling concern:** No caching of freebusy data. If 20 users check availability for the same 1-hour window within a minute, we make 20 freebusy queries instead of 1.

**Current mitigation:** Rate limiting (10 bookings per 10 minutes per IP) reduces booking pressure. But the check_availability endpoint (60 requests per minute) is not rate-protected by caching.

**Improvement path:**
1. Cache freebusy results for 30-60 seconds per time window
2. Use Redis to store the cache: key = `freebusy:${calendarId}:${date}`, value = array of busy periods
3. Invalidate cache when a new event is created
4. Consider batching multiple checks into a single API call if the SDK supports it

---

### Email Sending is Non-Blocking but Not Monitored

**Files:**
- `lib/services/bookings.ts` (line 355-405): `sendEmail()` calls use `.catch()` but don't retry or log failures
- All email routes use the same pattern: fire-and-forget

**Impact:** If Gmail API is down or the refresh token expires, emails silently fail. Bookers never receive confirmations, hosts never get notifications. The booking appears successful to the user even though they weren't notified.

**Risk level:** Low for availability (no email sent), medium for booking confirmation (user thinks they're booked but no email), high for reminder cron (users won't get 24h reminders).

**Improvement path:**
1. Add retry logic: wrap `sendEmail()` calls in `withRetry()` (already exists for calendar operations)
2. Log send failures to Sentry with the booking token as context
3. Implement a "pending emails" queue in Redis: if send fails, store the request in Redis with a TTL (e.g., 24 hours)
4. Add a periodic job (separate cron) that retries pending emails from the queue

---

### All-Day Event Processing Has Silent Catch Block

**Files:**
- `lib/availability.ts` (line 119-139): All-day event listing is in a try/catch that swallows all errors

**Impact:** If the calendar.events.list() call fails (network error, quota exceeded, permission denied), the code silently continues and treats those days as available, potentially causing double-bookings.

**Risk level:** Medium. Network hiccups are rare, but quota exhaustion is possible under load.

**Improvement path:**
1. Log the error to Sentry even though we're catching it
2. If we're nearing a quota error, raise an exception rather than silently degrading
3. Add a flag to return partial results with a warning to the client

---

## Security Considerations

### Clerk Token Verification Uses Private API

**Files:**
- `app/[transport]/route.ts` (line 54-66): Uses `requestState.toAuth()` which is not publicly exposed

**Risk:** If Clerk updates their SDK, this breaks. In a broken state, the MCP endpoint may authenticate all requests (if the error is silently caught) or reject all requests.

**Mitigation:** Add a guard: if `toAuth()` fails, explicitly throw a 401 error rather than continuing:

```typescript
if (typeof clerkAuth.toAuth !== 'function') {
  throw new Error('Clerk SDK version mismatch: toAuth() not found');
}
```

**Recommended:** File a feature request with Clerk to export a public conversion function.

---

### Content Security Policy Uses `unsafe-inline`

**Files:**
- `next.config.ts` (line 23): `script-src 'self' 'unsafe-inline'`

**Why:** Next.js requires inline scripts for React hydration, and the app uses an inline script for dark mode detection.

**Current exceptions:** `.sec-exceptions.md` (Exception 2) documents this and lists mitigating controls.

**Path to resolution:** Implement nonce-based CSP using Next.js middleware. All inline scripts would receive a unique nonce, and CSP would enforce `script-src 'nonce-{value}'` only. This requires updating `app/layout.tsx` and `middleware.ts`.

---

### Email Regex ReDoS Risk (Low, Mitigated)

**Files:**
- `app/api/bookings/route.ts` (line 60): Email validation regex
- `.sec-exceptions.md` (Exception 3) documents this

**Current mitigation:** Upstash rate limiting (10 bookings per 10 minutes per IP) prevents automated attacks. Input length is capped.

**Risk assessment:** Low in practice given the rate limiter.

---

## Test Coverage Gaps

### API Route Error Paths Untested

**Files:**
- `app/api/bookings/route.ts`: POST handler has no unit tests
- `app/api/bookings/[token]/route.ts`: GET/PATCH/DELETE handlers have no unit tests
- `app/api/availability/route.ts`: GET handler has no unit tests

**What's not tested:**
- Invalid input handling (missing fields, bad types)
- Rate limit responses
- Calendar API failures (503, timeout)
- Conflict detection (409 responses)
- Successful booking creation and response format

**Files with tests:**
- `lib/__tests__/availability-route.test.ts`: Tests the availability endpoint's timezone validation
- `lib/__tests__/email-validation.test.ts`: Tests email regex edge cases
- `lib/mcp/__tests__/tools.test.ts`: Tests Zod schemas and error classes

**Recommended:** Add comprehensive route tests using a mock Google Calendar client:
- `app/__tests__/api/bookings/route.test.ts`
- `app/__tests__/api/bookings/[token]/route.test.ts`
- `app/__tests__/api/availability/route.test.ts`

---

### MCP Tool Error Handling Partially Tested

**Files:**
- `lib/mcp/__tests__/tools.test.ts`: Tests schemas but not tool execution paths

**What's missing:**
- End-to-end tool invocation (calling the handler with params)
- Error propagation (ConflictError, CalendarApiError) handled correctly
- Response format validation
- Logging behavior

**Recommended:** Expand `lib/mcp/__tests__/tools.test.ts` to mock the MCP server and invoke actual tool handlers:

```typescript
describe('create_booking tool execution', () => {
  it('returns 409 when slot is taken', async () => {
    // Mock createBooking to throw ConflictError
    // Invoke tool handler
    // Assert response has isError: true and correct message
  });
});
```

---

### Email Building Not Directly Tested

**Files:**
- `lib/gmail.ts`: `buildIcs()`, `buildMime()`, `escapeHtml()` have limited test coverage
- Tests exist for `sanitizeHeader()` but not for full email MIME structure

**What's missing:**
- HTML escape tests for all special characters
- MIME boundary format validation
- ICS format validation (RFC 5545 compliance)
- Full end-to-end email rendering with user input

**Recommended:** Add `lib/__tests__/email-rendering.test.ts`:

```typescript
describe('email rendering', () => {
  it('escapes user input in all HTML fields', () => {
    // Test escapeHtml with XSS payloads
  });
  it('buildMime produces valid MIME structure', () => {
    // Parse built MIME and validate structure
  });
  it('buildIcs produces valid RFC 5545', () => {
    // Validate ICS against RFC 5545
  });
});
```

---

### Cron Job Not Tested

**Files:**
- `app/api/cron/reminders/route.ts`: No unit or integration tests

**What's not tested:**
- Authentication (CRON_SECRET verification)
- Date filtering (correctly identifies events in 24h window)
- Email sending (all fields rendered correctly)
- Error recovery (continues on single event failure)

**Risk:** A deploy could break the reminder cron, and no automated tests catch it until a user reports missing reminders (24h later).

**Recommended:** Add `app/__tests__/api/cron/reminders.test.ts`:

```typescript
describe('POST /api/cron/reminders', () => {
  it('rejects request without valid CRON_SECRET', () => { /* ... */ });
  it('sends reminders for events in next 24h window', () => { /* ... */ });
  it('continues on email send failure', () => { /* ... */ });
});
```

---

## Missing Critical Features

### No Monitoring for Rate Limiter Service Outages

**Issue:** If Upstash Redis goes down, `checkRateLimit()` returns a 503 "service down" response (line 71 in `lib/rate-limit.ts`), rejecting all requests. This is intentionally conservative, but there's no alert for it.

**Impact:** Total outage even though the booking service could work (it just wouldn't be rate-limited).

**Improvement:** Add an automatic alert to PostHog or Sentry when rate limiter returns 503, so the team can decide to either:
1. Wait for Upstash to recover
2. Switch to an in-memory rate limiter with reduced limits
3. Disable rate limiting (risky)

---

### No Idempotency Keys for Booking Creation

**Issue:** If a client retries a booking request due to network timeout, it creates a duplicate booking instead of returning the existing one.

**Files:**
- `app/api/bookings/route.ts`: No idempotency check
- `lib/services/bookings.ts`: No idempotency check

**Impact:** User attempts to book "Coffee at 2pm", network glitches, they click "Try again", now there are two bookings.

**Improvement path:** Add an optional `idempotencyKey` field to booking requests. Store (key -> eventId) mapping in Redis with 1-hour TTL. If a request with the same key arrives, return the cached eventId instead of creating a new event.

---

### No Booking Confirmation Webhook

**Issue:** When a user reschedules or cancels via the manage booking page, the app sends emails but has no way to notify external systems (e.g., a calendar sync service or CRM).

**Files:**
- `lib/services/bookings.ts`: Email-only notifications
- `app/api/bookings/[token]/route.ts`: Email-only notifications

**Improvement path:** Add a simple webhook dispatcher:
1. Define a `BOOKING_WEBHOOK_URL` env var
2. After each booking operation (create, reschedule, cancel), POST a JSON payload to the webhook with event details
3. Implement simple retry logic (3 attempts, exponential backoff)

---

## Known Limitations

### Timezones are Not Validated Against Intl.supportedValuesOf

**Status:** Despite `.sec-exceptions.md` claiming this is fixed (R5), the code does not validate timezones.

**Files affected:**
- `lib/services/bookings.ts` (line 92): `timezone` parameter used without validation
- `lib/availability.ts`: Timezone parameter used in date-fns-tz operations

**Fix:** Add this check at the start of `createBooking()` and `rescheduleBooking()`:

```typescript
if (!Intl.supportedValuesOf('timeZone').includes(timezone)) {
  throw new Error(`Invalid timezone: ${timezone}`);
}
```

---

### Google Calendar API Calls Are Not Batched

**Issue:** For operations like listing 30 events to check availability, we make 1 API call. For creating a booking, we make 2 API calls (freebusy query, then insert). There's no batching.

**Impact:** Under high load, we hit Google's quota faster than necessary. If a malicious user hits the availability endpoint 60 times per minute (allowed by rate limiter), that's 60 API calls to freebusy.

**Improvement:** Use Google's batch API to combine multiple requests into one. This reduces quota consumption but adds complexity.

---

### No Email Verification Before Booking

**Issue:** A user can book under any email address; there's no verification step. If they mistype their email, they won't receive the confirmation.

**Current design:** This is intentional — the booking page is public and doesn't require login. Verification could be added optionally.

**Improvement path (optional):** Add a `verifyEmail` flow:
1. User books with email X
2. App sends a verification link to email X
3. User clicks link (within 1 hour) to confirm
4. Only then is the event marked as confirmed

This requires storing "unconfirmed bookings" in a temporary store (Redis) and a verification endpoint.

---

## Dependency Risks

### Critical Dependency: googleapis

**Package:** `googleapis` ^171.4.0

**Risk:** This is the only interface to Google Calendar. If a breaking change is released, the app breaks. The team has no alternative calendar provider.

**Mitigation:** Pin the version in package-lock.json (automatic with npm ci). Test upgrade in staging before applying to production.

**Monitoring:** Subscribe to googleapis release notes for security updates.

---

### Critical Dependency: @clerk/mcp-tools

**Package:** `@clerk/mcp-tools` ^0.3.1

**Risk:** MCP server integration relies on this package. It's a relatively new library (v0.x), so breaking changes are possible.

**Mitigation:** Pin version. Monitor Clerk's GitHub releases and blog for changes. Have a fallback plan to implement Clerk OAuth directly if the package breaks.

---

### PostHog Analytics Library

**Package:** `posthog-js` ^1.360.2, `posthog-node` ^5.28.2

**Risk:** Analytics is non-critical, but if PostHog is down, the instrumentation in `instrumentation.ts` could delay app startup.

**Current mitigation:** Errors in log export are likely silent (OLTP exporter logs to console, not thrown).

**Improvement:** Wrap `sdk.start()` in try-catch and log failures, but don't block startup.

---

## Recommendations Priority

**High (address next):**
1. Consolidate API route logic into service functions to eliminate code duplication
2. Add validation for timezone parameter as per security exceptions
3. Add comprehensive test coverage for API routes and error paths
4. Implement email retry logic with Redis queue

**Medium (address in next phase):**
1. Centralize environment variable defaults in `lib/env-config.ts`
2. Extract email builders into a dedicated `lib/email-builders.ts` module
3. Add caching layer for freebusy queries
4. Implement distributed locking for booking creation

**Low (nice-to-have, defer):**
1. Nonce-based CSP implementation
2. Idempotency keys for booking requests
3. Webhook notifications for booking events
4. Email verification flow

---

*Concerns audit: 2026-03-24*
