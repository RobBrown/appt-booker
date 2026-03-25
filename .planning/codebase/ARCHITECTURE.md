# Architecture

**Analysis Date:** 2026-03-24

## Pattern Overview

**Overall:** Next.js App Router with service layer abstraction and dual API surfaces (REST + MCP)

**Key Characteristics:**
- Service functions in `lib/services/` shared by both API routes and MCP tools — no HTTP self-calls
- Authentication split by use case: Clerk OAuth for MCP (`/mcp`, `/sse`), CORS middleware for REST (`/api/*`)
- Calendar as the single source of truth — all booking state stored in Google Calendar extended properties
- Separate code paths for MCP (tools + resources) and REST API (routes), but identical business logic underneath

## Layers

**Frontend (Client-Side):**
- Purpose: Interactive booking UI and management interface
- Location: `components/booking/`
- Contains: React components for duration selection, date/time picker, location selection, attendee management, confirmation screens
- Depends on: Next.js App Router page/API routes
- Used by: `app/page.tsx` (booking) and `app/manage/[token]/page.tsx` (management)

**API Routes (REST):**
- Purpose: HTTP endpoints for booking, availability, and email operations
- Location: `app/api/*/route.ts`
- Contains: Request validation, rate limiting, error handling, calls to service functions
- Depends on: Service layer (`lib/services/`), availability helpers (`lib/availability`), Google Calendar client
- Used by: Frontend forms and scheduled cron jobs

**MCP Transport & Handler:**
- Purpose: Model Context Protocol endpoint for AI agents
- Location: `app/[transport]/route.ts` (handles `/mcp` and `/sse`)
- Contains: Streamable HTTP/SSE transport wrapper, Clerk OAuth token verification
- Depends on: MCP server initialization, withMcpAuth middleware
- Used by: Claude, ChatGPT, Cursor, and other MCP-capable AI clients

**Service Layer:**
- Purpose: Importable business logic shared by API routes and MCP tools
- Location: `lib/services/`
- Contains: `availability.ts`, `bookings.ts`, `meetings.ts`
- Depends on: Google Calendar client, Zoom SDK, timezone utilities
- Used by: Both REST API routes and MCP tool handlers

**MCP Tools & Resources:**
- Purpose: Tool definitions and resource schema for AI agent discovery
- Location: `lib/mcp/tools/` and `lib/mcp/resources/`
- Contains: 5 tools (check_availability, create_booking, get_booking, reschedule_booking, cancel_booking), host-info resource, booking workflow prompt
- Depends on: Service layer functions, Zod schemas for parameter validation
- Used by: MCP server initialization (`lib/mcp/server.ts`)

**Integration Layer:**
- Purpose: Third-party service clients and helpers
- Location: `lib/google-auth.ts`, `lib/gmail.ts`, `lib/zoom.ts`, `lib/posthog-server.ts`
- Contains: Google Calendar/Gmail API auth, Zoom API helpers, PostHog analytics
- Depends on: googleapis, Zoom SDK, PostHog SDK
- Used by: Service layer and API routes

**Utility & Infrastructure:**
- Purpose: Cross-cutting concerns, validation, rate limiting, timezone handling
- Location: `lib/availability.ts`, `lib/rate-limit.ts`, `lib/timezones.ts`, `lib/utils.ts`, `lib/validate-env.ts`
- Contains: Freebusy checking, slot calculation, rate limiting (Upstash), timezone conversions
- Depends on: date-fns, date-fns-tz, Upstash Redis
- Used by: Service layer and API routes

**OAuth Endpoints:**
- Purpose: Clerk OAuth metadata discovery for MCP clients
- Location: `app/.well-known/oauth-protected-resource/route.ts`, `app/.well-known/mcp.json/route.ts`
- Contains: OAuth server metadata, MCP endpoint discovery payload
- Depends on: Clerk SDK, environment variables
- Used by: MCP clients during authorization flow and discovery

## Data Flow

**Availability Check:**

1. Client/Agent → `GET /api/availability?date=YYYY-MM-DD&duration=30&timezone=America/Toronto` OR MCP tool `check_availability`
2. API route (`app/api/availability/route.ts`) OR MCP tool (`lib/mcp/tools/check-availability.ts`)
3. Call `getAvailability()` from `lib/services/availability.ts`
4. Service function calls `getAvailableSlots()` from `lib/availability.ts`
5. Query Google Calendar freebusy for the date/duration/timezone
6. Return list of HH:MM slots in requested timezone
7. Response: `{ date, timezone, duration, slots: ["09:00", "10:00", ...] }`

**Booking Creation:**

1. Client/Agent → `POST /api/bookings` with booking params OR MCP tool `create_booking`
2. API route OR MCP tool calls `createBooking()` from `lib/services/bookings.ts`
3. Service function:
   - Validates parameters (duration, email, phone, description length)
   - Re-checks availability via `getBusyPeriods()` (conflict detection)
   - Auto-generates meeting link if needed (Zoom/Google Meet/Jitsi)
   - Inserts event into Google Calendar with extended properties (token, bookerEmail, locationType, etc.)
   - Sends confirmation email to booker, notification to host, invites to additional attendees
   - Updates Zoom meeting metadata (non-fatal if fails)
4. Returns: `{ eventId, token, startTime, duration }`

**Booking Lookup:**

1. Client → `GET /api/bookings/[token]` OR MCP tool `get_booking` with token
2. API route OR MCP tool calls `getBooking()` from `lib/services/bookings.ts`
3. Service function:
   - Searches Google Calendar for event with matching token in extended properties
   - Returns booking details (startTime, duration, locationType, bookerEmail, etc.)
4. Returns: `GetBookingResult` interface

**Booking Reschedule:**

1. Client → `PATCH /api/bookings/[token]` with newStartTime OR MCP tool `reschedule_booking`
2. API route OR MCP tool calls `rescheduleBooking()` from `lib/services/bookings.ts`
3. Service function:
   - Finds event by token
   - Re-checks availability at new time (conflict detection)
   - Updates Google Calendar event start/end
   - Updates Zoom meeting if applicable
   - Sends reschedule notification email
4. Returns: Updated booking details

**Booking Cancellation:**

1. Client → `DELETE /api/bookings/[token]` OR MCP tool `cancel_booking`
2. API route OR MCP tool calls `cancelBooking()` from `lib/services/bookings.ts`
3. Service function:
   - Finds event by token
   - Deletes from Google Calendar
   - Deletes Zoom meeting if applicable
   - Sends cancellation email
4. Returns: `{ success: true, token }`

**State Management:**

- Google Calendar is the source of truth for all booking state
- Management token is a UUID stored in the event's extended properties (private)
- No database; all queries via Google Calendar API
- Past events remain queryable for management/audit purposes
- Rate limiting via Upstash Redis (shared across all instances)

## Key Abstractions

**Service Functions:**
- Purpose: Pure business logic, decoupled from HTTP transport
- Examples: `lib/services/bookings.ts`, `lib/services/availability.ts`, `lib/services/meetings.ts`
- Pattern: Exported async functions with typed params/results, error classes for specific failure modes

**Error Classes:**
- `ConflictError` (409) — slot taken, must retry with different time
- `NotFoundError` (404) — booking token not found
- `CalendarApiError` (503) — Google Calendar unreachable

**Extended Properties:**
- Pattern: All booking metadata stored as private extended properties on Google Calendar events
- Used for: token, locationType, locationDetails, bookerEmail, bookerPhone, duration, description, additionalAttendeesJson
- Why: Survives event updates, accessible in calendar UI, no separate DB needed

**MCP Tool Registration:**
- Pattern: Each tool in `lib/mcp/tools/[tool-name].ts` exports `register[ToolName](server)`
- All tools registered in `lib/mcp/server.ts` → `initializeMcpServer()`
- Each tool: receives `extra.authInfo` containing authenticated user email from Clerk

**Availability Calculation:**
- Queries Google Calendar freebusy
- Applies working hours constraints (env vars or calendar settings)
- Returns slots that fit duration without conflicts
- Respects timezone for both query and response

## Entry Points

**Booking UI:**
- Location: `app/page.tsx`
- Triggers: User visits `/`
- Responsibilities: Renders `BookingPage` component, passes environment-based config (host name, durations, default location)

**Booking Management UI:**
- Location: `app/manage/[token]/page.tsx`
- Triggers: User visits `/manage/[token]`
- Responsibilities: Displays booking details, reschedule interface, cancellation confirmation

**REST API — Availability:**
- Location: `app/api/availability/route.ts`
- Triggers: `GET /api/availability?date=...&duration=...&timezone=...`
- Responsibilities: Rate limit check, param validation, calls service, returns slot list

**REST API — Create Booking:**
- Location: `app/api/bookings/route.ts`
- Triggers: `POST /api/bookings` with booking payload
- Responsibilities: Param validation (email, name, length limits), calls service, returns eventId + token

**REST API — Booking Details:**
- Location: `app/api/bookings/[token]/route.ts`
- Triggers: `GET /api/bookings/[token]` or `PATCH` or `DELETE`
- Responsibilities: Route to service function (getBooking, rescheduleBooking, cancelBooking)

**MCP Transport:**
- Location: `app/[transport]/route.ts`
- Triggers: POST/GET/DELETE `/mcp` or `/sse`
- Responsibilities: Clerk token verification, MCP handler dispatch to tools

**OAuth Metadata:**
- Location: `app/.well-known/oauth-protected-resource/route.ts`
- Triggers: GET `/.well-known/oauth-protected-resource`
- Responsibilities: Return Clerk OAuth server metadata for MCP client discovery

**MCP Discovery:**
- Location: `app/.well-known/mcp.json/route.ts`
- Triggers: GET `/.well-known/mcp.json`
- Responsibilities: Return MCP endpoint URL, tool list, server name

**Cron Jobs:**
- Locations: `app/api/cron/reminders/route.ts`, `app/api/cron/token-health/route.ts`
- Triggers: External cron service (Render, etc.) via POST
- Responsibilities: Find bookings, send reminders, clean up expired tokens

## Error Handling

**Strategy:** Service functions throw typed errors; API routes/MCP tools catch and convert to transport-appropriate responses

**Patterns:**

- Service throws `ConflictError` (409) → API returns 409, MCP returns isError: true
- Service throws `NotFoundError` (404) → API returns 404, MCP returns isError: true
- Service throws `CalendarApiError` (503) → API returns 503, MCP returns isError: true
- Service throws `Error` (generic) → API returns 400, MCP returns isError: true with message
- Unhandled exceptions: Sentry captures, response is 500

**Non-Fatal Operations:**

These errors are logged but don't fail the booking:
- Sending confirmation emails
- Updating Zoom meeting metadata
- Publishing PostHog analytics events

## Cross-Cutting Concerns

**Logging:**
- Console via `console.error()` for actual errors
- MCP tool calls logged via `logToolCall()` at `lib/mcp/logger.ts` (tool name, user email, status, duration)
- Sentry integration via `@sentry/nextjs` for production errors

**Validation:**
- Input length constraints enforced in API routes (email regex, name/phone/description max lengths)
- MCP tools use Zod schemas for parameter validation before calling service functions
- Service functions throw on invalid inputs (bad duration, timezone, date format)

**Authentication:**
- REST API: CORS guard in middleware (no auth on `/api/*`)
- MCP: Clerk OAuth token required, verified via `verifyClerkToken()` in route handler
- Cron jobs: X-Cron-Token header validation in route handlers

**Rate Limiting:**
- Upstash Redis-based limit per IP + route
- Configureable per endpoint (availability is 10 reqs/min, bookings is 5 reqs/min)
- Returns 429 if exceeded

**Analytics:**
- PostHog server-side tracking of booking events (creation, cancellation, reschedule)
- PostHog client-side tracking via `posthog-js` (page views, UI interactions)
- OpenTelemetry logs exported to PostHog for centralized observability

**Timezone Handling:**
- All stored times in UTC (Google Calendar format)
- All user-facing times converted to requested timezone
- date-fns-tz used throughout for conversions
- Host timezone from env var or Google Calendar settings
- Slot calculations respect working hours in host timezone

---

*Architecture analysis: 2026-03-24*
