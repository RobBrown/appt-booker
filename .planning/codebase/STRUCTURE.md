# Codebase Structure

**Analysis Date:** 2026-03-24

## Directory Layout

```
/Users/rob/project/appt-booker/
├── app/                        # Next.js App Router routes
│   ├── layout.tsx              # Root layout, fonts, dark mode detection
│   ├── page.tsx                # Booking UI entry point
│   ├── globals.css             # Tailwind styles
│   ├── .well-known/            # OAuth and MCP discovery endpoints
│   │   ├── oauth-protected-resource/route.ts
│   │   └── mcp.json/route.ts
│   ├── [transport]/            # MCP transport handler (dynamic for /mcp, /sse)
│   │   └── route.ts
│   ├── manage/[token]/         # Booking management UI (reschedule/cancel)
│   │   └── page.tsx
│   ├── api/                    # REST API routes
│   │   ├── availability/route.ts        # GET slots for date/duration/timezone
│   │   ├── bookings/route.ts            # POST create booking
│   │   ├── bookings/[token]/route.ts    # GET/PATCH/DELETE booking
│   │   ├── meetings/create/route.ts     # POST create meeting link
│   │   ├── email/confirmation/route.ts  # Send confirmation email
│   │   ├── email/notification/route.ts  # Send host notification
│   │   ├── email/reschedule/route.ts    # Send reschedule email
│   │   ├── email/cancellation/route.ts  # Send cancellation email
│   │   ├── cron/reminders/route.ts      # Send booking reminders
│   │   ├── cron/token-health/route.ts   # Cleanup and validation
│   │   └── health/route.ts              # Health check endpoint
│   └── api/meetings/            # Placeholder for future expansion
│       └── ...
├── components/                  # React components
│   ├── ui/                      # shadcn/ui primitives
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── badge.tsx
│   │   └── separator.tsx
│   └── booking/                 # Booking workflow components
│       ├── BookingPage.tsx      # Main state container for booking flow
│       ├── DurationStep.tsx     # Duration selection (4 options, 2x2 grid mobile)
│       ├── DateTimeStep.tsx     # Date/time picker (7-day chips + full calendar toggle)
│       ├── LocationSection.tsx  # Location type selector (3x2 grid)
│       ├── AttendeesSection.tsx # Additional attendees input
│       ├── AgendaSection.tsx    # Meeting description
│       ├── SummaryPanel.tsx     # Booking summary display
│       ├── ConfirmationScreen.tsx  # Success screen with token/link
│       └── DetailsStep.tsx      # (Unused, kept for reference)
├── lib/                         # Shared utilities and business logic
│   ├── services/                # Importable service functions (shared by API + MCP)
│   │   ├── availability.ts      # getAvailability(date, duration, timezone)
│   │   ├── bookings.ts          # createBooking, getBooking, rescheduleBooking, cancelBooking
│   │   └── meetings.ts          # createMeetingLink(type, start, duration, timezone)
│   ├── mcp/                     # MCP server and tools
│   │   ├── server.ts            # initializeMcpServer() — registers all tools + resources
│   │   ├── logger.ts            # logToolCall(tool, userEmail, status, durationMs)
│   │   ├── tools/               # 5 MCP tools
│   │   │   ├── check-availability.ts    # registerCheckAvailability(server)
│   │   │   ├── create-booking.ts        # registerCreateBooking(server)
│   │   │   ├── get-booking.ts           # registerGetBooking(server)
│   │   │   ├── reschedule-booking.ts    # registerRescheduleBooking(server)
│   │   │   └── cancel-booking.ts        # registerCancelBooking(server)
│   │   ├── resources/           # MCP resources
│   │   │   └── host-info.ts     # registerHostInfoResource(server)
│   │   ├── prompts/             # MCP prompts (workflow templates)
│   │   │   └── book-appointment.ts      # registerBookAppointmentPrompt(server)
│   │   └── __tests__/           # MCP tool tests
│   │       └── tools.test.ts
│   ├── google-auth.ts           # getGoogleAuth(), getCalendarClient()
│   ├── availability.ts          # getAvailableSlots, getBusyPeriods, getHostTimezone, getWorkingPeriods
│   ├── gmail.ts                 # sendEmail, buildIcs, email formatting helpers
│   ├── zoom.ts                  # createZoomMeeting, updateZoomMeeting, deleteZoomMeeting
│   ├── rate-limit.ts            # checkRateLimit(limiter, request), Upstash Redis limiters
│   ├── rate-limit.ts            # Upstash Redis rate limiters
│   ├── timezones.ts             # Timezone utilities, IANA list
│   ├── posthog-server.ts        # getPostHogClient(), server-side analytics
│   ├── utils.ts                 # General utilities (cn, etc.)
│   ├── validate-env.ts          # Environment variable validation at import
│   ├── mock-data.ts             # Mock data for testing/development
│   └── __tests__/               # General library tests
│       ├── availability-route.test.ts
│       ├── cron-auth.test.ts
│       ├── email-validation.test.ts
│       ├── gmail.test.ts
│       ├── input-length.test.ts
│       ├── middleware.test.ts
│       └── validate-env.test.ts
├── public/                      # Static assets
│   ├── avatar.webp              # Host avatar image
│   └── (other static files)
├── middleware.ts                # Next.js middleware (CORS guard for /api/*)
├── instrumentation.ts           # OpenTelemetry setup
├── instrumentation-client.ts    # Client-side PostHog initialization
├── next.config.ts               # Next.js config (security headers, external packages)
├── tsconfig.json                # TypeScript config
├── vitest.config.ts             # Vitest config (if present)
├── components.json              # shadcn/ui config
├── tailwind.config.ts           # Tailwind CSS config
├── package.json                 # Dependencies and scripts
├── CLAUDE.md                    # Full autonomous build spec (MCP implementation)
├── CLAUDE-ORIGINAL.md           # Original project spec
├── PRD.md                       # Product requirements document
├── WORKPLAN.md                  # 10-phase implementation plan
├── .env.example                 # Environment variable template
├── .env.local                   # Development environment (ignored)
├── .gitignore                   # Git ignore rules
├── .gitpublicignore             # Additional public ignore rules
└── .planning/                   # GSD codebase analysis output
    └── codebase/                # Planning documents generated by /gsd:map-codebase
        ├── ARCHITECTURE.md
        ├── STRUCTURE.md
        ├── CONVENTIONS.md (when quality focus)
        ├── TESTING.md (when quality focus)
        ├── STACK.md (when tech focus)
        ├── INTEGRATIONS.md (when tech focus)
        └── CONCERNS.md (when concerns focus)
```

## Directory Purposes

**`app/`:**
- Purpose: All Next.js App Router routes (pages and API endpoints)
- Routing: File-based, with `[dynamic]` segments and `route.ts` handlers
- Contains: Page components, API route handlers, static assets in `/public`

**`components/`:**
- Purpose: Reusable React components
- Organization: `ui/` for primitives (shadcn/ui), `booking/` for domain-specific components
- Key pattern: All components are React Client Components (`"use client"`) that manage state and call API routes

**`lib/`:**
- Purpose: Shared utilities, service logic, and integration code
- Organization: Subdirectories by concern (services, mcp, tests)
- Key pattern: Service functions in `lib/services/` are importable and used by both API routes and MCP tools

**`lib/services/`:**
- Purpose: Importable business logic (used by both REST API and MCP)
- Pattern: Typed params + results, error classes, no HTTP dependencies
- Files: `availability.ts`, `bookings.ts`, `meetings.ts`

**`lib/mcp/`:**
- Purpose: MCP (Model Context Protocol) server, tools, and resources
- Organization: `tools/`, `resources/`, `prompts/`, `__tests__/`, plus `server.ts` and `logger.ts`
- Pattern: Each tool/resource exports a `register*` function called by `server.ts`

**`public/`:**
- Purpose: Static assets served directly by Next.js
- Contains: `avatar.webp` (host avatar), favicons, etc.
- Served at: `/[filename]`

**`.planning/codebase/`:**
- Purpose: GSD mapping output (generated by `/gsd:map-codebase` command)
- Files: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md
- Used by: `/gsd:plan-phase` and `/gsd:execute-phase` commands

## Key File Locations

**Entry Points:**

- `app/page.tsx` — Booking UI at `/`
- `app/manage/[token]/page.tsx` — Booking management at `/manage/[token]`
- `app/[transport]/route.ts` — MCP endpoint at `/mcp` or `/sse`
- `middleware.ts` — Global middleware (CORS guard)
- `instrumentation.ts` — Server-side initialization (OpenTelemetry)
- `instrumentation-client.ts` — Client-side initialization (PostHog)

**Configuration:**

- `next.config.ts` — Next.js config (security headers, external packages, rewrites)
- `middleware.ts` — CORS middleware, exported as default function for runtime
- `tsconfig.json` — TypeScript strict mode, path aliases (`@/lib`, `@/components`)
- `tailwind.config.ts` — Tailwind CSS with custom color tokens
- `vitest.config.ts` — Test runner configuration
- `.env.example` — Template for required env vars
- `.env.local` — Development secrets (not committed)

**Core Logic:**

- `lib/services/bookings.ts` — createBooking, getBooking, rescheduleBooking, cancelBooking
- `lib/services/availability.ts` — getAvailability (wrapper around getAvailableSlots)
- `lib/services/meetings.ts` — createMeetingLink (Zoom/Google Meet/Jitsi generation)
- `lib/availability.ts` — Low-level slot calculation, working hours, freebusy queries
- `lib/google-auth.ts` — Google Calendar API client setup
- `lib/gmail.ts` — Email formatting and sending

**Testing:**

- `lib/__tests__/` — Unit tests for utilities, middleware, validation
- `lib/mcp/__tests__/tools.test.ts` — MCP tool tests
- Pattern: Co-located with source (not in separate `/tests` directory)

**API Routes:**

- `app/api/availability/route.ts` — GET `/api/availability?date=...&duration=...&timezone=...`
- `app/api/bookings/route.ts` — POST `/api/bookings`
- `app/api/bookings/[token]/route.ts` — GET/PATCH/DELETE `/api/bookings/[token]`
- `app/api/email/*/route.ts` — Email queue endpoints (confirmation, notification, reschedule, cancellation)
- `app/api/cron/*/route.ts` — Scheduled job endpoints (reminders, token health)
- `app/api/meetings/create/route.ts` — POST to create meeting links

**MCP Endpoints:**

- `app/.well-known/oauth-protected-resource/route.ts` — GET `/.well-known/oauth-protected-resource`
- `app/.well-known/mcp.json/route.ts` — GET `/.well-known/mcp.json`
- `app/[transport]/route.ts` — POST/GET/DELETE `/mcp` and `/sse`

## Naming Conventions

**Files:**

- API routes: `route.ts` (Next.js convention)
- Pages: `page.tsx` (Next.js convention)
- Components: PascalCase, `.tsx` for client/server mix, e.g., `BookingPage.tsx`, `DurationStep.tsx`
- Utilities: camelCase, `.ts`, e.g., `google-auth.ts`, `rate-limit.ts`
- Tests: `*.test.ts` or `*.spec.ts` in `__tests__/` or adjacent to source

**Directories:**

- All lowercase, use hyphens for multi-word (Next.js convention): `api/`, `components/`, `lib/services/`, `lib/mcp/`, etc.
- Dynamic segments: `[parameter]`, e.g., `[transport]`, `[token]`

**TypeScript:**

- Functions: camelCase, e.g., `createBooking`, `getAvailability`, `sendEmail`
- Classes/Errors: PascalCase, e.g., `ConflictError`, `NotFoundError`, `CalendarApiError`
- Interfaces/Types: PascalCase, e.g., `CreateBookingParams`, `GetBookingResult`, `Duration`
- Constants: UPPER_SNAKE_CASE, e.g., `VALID_DURATIONS`, `DEFAULT_WORKING_PERIODS`

**React Components:**

- Props interfaces: `[ComponentName]Props`, e.g., `DurationStepProps`
- Functional components: PascalCase function export, e.g., `export function BookingPage(...)`
- Hooks (custom): `use[Feature]`, e.g., `useBookingState` (not used heavily, mostly local state)

## Where to Add New Code

**New Feature (e.g., accept payments):**
- Primary code: `lib/services/payments.ts` (business logic)
- Service wrapper: `lib/services/` if needed
- API endpoint: `app/api/payments/route.ts`
- MCP tool: `lib/mcp/tools/process-payment.ts` (optional, if AI agents should call it)
- Component: `components/payment/PaymentForm.tsx` (if UI needed)
- Tests: `lib/__tests__/payments.test.ts` and/or `lib/mcp/__tests__/tools.test.ts`

**New Component:**
- Location: `components/booking/[ComponentName].tsx`
- Pattern: React functional component, props interface above, "use client" if stateful
- Integration: Import and use in `BookingPage.tsx` or relevant parent

**New Utility/Helper:**
- General utility: `lib/utils.ts` or new file `lib/[feature].ts`
- Specific domain (calendar, email, etc.): `lib/[domain].ts` (e.g., `lib/zoom.ts`)
- Tests: `lib/__tests__/[feature].test.ts`

**New API Route:**
- Location: `app/api/[feature]/route.ts` or `app/api/[feature]/[dynamic]/route.ts`
- Pattern: Import service functions, validate input, call service, return typed response
- Example: `app/api/payments/route.ts` → import `createPayment()` from `lib/services/payments.ts` → POST handler

**New MCP Tool:**
- Location: `lib/mcp/tools/[tool-name].ts`
- Pattern: Export `register[ToolName](server: McpServer)` function
- Register in: `lib/mcp/server.ts` by adding call to `register[ToolName](server)`
- Use service functions: Import and call from `lib/services/`

**Shared Email Templates:**
- Location: Inline in service functions, e.g., `lib/services/bookings.ts`
- Pattern: Use `renderEmailHtml()` from `lib/gmail.ts` with detail rows and buttons
- Text version: Parallel array join, e.g., `[...parts].join("\n")`

**New Route/Page:**
- Location: `app/[route]/page.tsx` or `app/[route]/[dynamic]/page.tsx`
- Pattern: React functional component, import components, render
- Layout: Automatically uses `app/layout.tsx`

## Special Directories

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes (by `npm run build`)
- Committed: No (in `.gitignore`)
- Contains: Compiled pages, API routes, static optimization

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in `.gitignore`)
- Locked: `package-lock.json` commits exact versions

**`.planning/codebase/`:**
- Purpose: GSD mapping output (analysis documents)
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Yes (shared with team/future Claudes)
- Used by: `/gsd:plan-phase`, `/gsd:execute-phase`

**`lib/__tests__/`, `lib/mcp/__tests__/`:**
- Purpose: Co-located unit tests
- Pattern: Tests live adjacent to source code, not in separate `/tests` directory
- Runner: Vitest (configured in `vitest.config.ts`)
- Command: `npm test`

## Import Path Aliases

**TypeScript `tsconfig.json`:**
- `@/` → project root
- `@/lib` → `lib/`
- `@/components` → `components/`

**Usage examples:**
```typescript
import { BookingPage } from "@/components/booking/BookingPage";
import { createBooking } from "@/lib/services/bookings";
import { getCalendarClient } from "@/lib/google-auth";
```

---

*Structure analysis: 2026-03-24*
