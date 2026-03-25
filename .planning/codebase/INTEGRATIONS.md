# External Integrations

**Analysis Date:** 2026-03-24

## APIs & External Services

**Google APIs:**
- Google Calendar API (v3)
  - Purpose: Check availability, create/reschedule/cancel appointments, retrieve working hours and timezone
  - SDK: `googleapis` (v171.4.0)
  - Auth: OAuth 2.0 with refresh token
  - Client: `getCalendarClient()` in `lib/google-auth.ts`
  - ENV: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`

- Google Gmail API (v1)
  - Purpose: Send booking confirmation and notification emails
  - SDK: `googleapis` (v171.4.0)
  - Auth: OAuth 2.0 with refresh token (shared with Calendar)
  - Client: Initialized in `lib/gmail.ts`
  - ENV: `GMAIL_USER` (sender address)
  - Implementation: MIME multipart builder with ICS calendar attachment in `lib/gmail.ts`

**Zoom (Server-to-Server OAuth):**
- Purpose: Integrate Zoom meeting links for remote meetings
- Auth: OAuth 2.0 Server-to-Server (JWT-based)
- ENV: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`
- Status: Configured in env but implementation status unclear from current codebase

**Clerk:**
- Purpose: OAuth 2.1 authorization server for MCP endpoint authentication
- Services:
  - Dynamic Client Registration (enabled)
  - Google social login
  - Microsoft social login
  - PKCE flow for OAuth
- SDKs:
  - `@clerk/nextjs` (7.0.4) - For Next.js integration
  - `@clerk/backend` (implicit via @clerk/nextjs) - Direct token verification
  - `@clerk/mcp-tools` (0.3.1) - MCP token verification and OAuth metadata
- Auth Flow: AI agents authenticate via Google/Microsoft, receive OAuth tokens for MCP endpoint access
- Client Setup: Lazy-initialized in `app/[transport]/route.ts` via `createClerkClient()`
- ENV: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

## Data Storage

**Databases:**
- None - No persistent database
- All appointment data sourced from Google Calendar

**File Storage:**
- Google Calendar - Event storage
- Email credentials in Google OAuth refresh token

**Caching:**
- Upstash Redis (optional, serverless)
  - Used for rate limiting only (sliding window algorithm)
  - Connection: REST API (HTTP), not TCP
  - ENV: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Graceful fallback: If Redis unavailable, requests return 503 "rate limit service down"

## Authentication & Identity

**Auth Provider:**
- Clerk (OAuth 2.1 authorization server)
  - MCP endpoint (`/mcp`) uses Clerk OAuth tokens
  - Token verification: `verifyClerkToken()` from `@clerk/mcp-tools/server`
  - Auth boundary: MCP endpoint returns 401 for unauthenticated requests
  - Social login: Google and Microsoft via Clerk Dashboard configuration

**Implementation:**
- MCP Transport Route: `app/[transport]/route.ts`
  - Uses `withMcpAuth` from mcp-handler
  - Token verification via Clerk backend client
  - Request state → Clerk auth object → verifyClerkToken
  - Public paths (no auth required): `/.well-known/*`, `/`, `/api/*`

**Public Endpoints (no auth):**
- `/.well-known/oauth-protected-resource` - OAuth resource metadata (Clerk spec)
- `/.well-known/mcp.json` - MCP discovery endpoint
- `GET /api/availability` - Public availability checking (CORS-guarded)
- `/` - Booking UI

## Monitoring & Observability

**Error Tracking:**
- Sentry (via @sentry/nextjs 10.42.0)
  - Configuration: `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`
  - Trace sample rate: 100% (1.0)
  - Client-side error capture enabled
  - Server-side error capture enabled
  - Integrated with rate limiting (`lib/rate-limit.ts` captures Upstash errors)
  - ENV: `SENTRY_DSN`
  - CSP allowlist: `https://*.ingest.sentry.io` and `https://*.ingest.us.sentry.io`

**Logs:**
- Console (default)
  - Sentry captures exceptions via `Sentry.captureException()`
  - Rate limit service failures logged to Sentry

**Analytics:**
- PostHog (v5.28.2 Node.js, v1.360.2 browser)
  - Server-side: `getPostHogClient()` in `lib/posthog-server.ts`
  - Client-side: PostHog JS SDK in browser
  - OpenTelemetry Integration: PostHog Logs via `@opentelemetry/exporter-logs-otlp-http`
  - Flush strategy: Immediate flush (flushAt: 1, flushInterval: 0)
  - ENV: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
  - Rewrite proxy: Next.js rewrites `/ingest/*` to PostHog US endpoints to avoid CORS issues

**Rate Limiting:**
- Upstash Rate Limit (via @upstash/ratelimit)
  - Sliding window algorithm
  - Endpoint limiters:
    - `availability`: 60 requests / 1 minute
    - `bookings`: 10 requests / 10 minutes
    - `email`: 10 requests / 10 minutes
    - `meetingsCreate`: 20 requests / 10 minutes
    - `manageRead`: 20 requests / 1 minute
    - `manageWrite`: 10 requests / 10 minutes
  - Implementation: `lib/rate-limit.ts` with `checkRateLimit()` function
  - IP detection: x-forwarded-for header (Render.com proxy aware)

## CI/CD & Deployment

**Hosting:**
- Render.com
  - Git commit SHA exposed via `NEXT_PUBLIC_GIT_SHA` env variable (first 7 chars from `RENDER_GIT_COMMIT`)
  - Deployment triggered by push to `main` branch

**CI Pipeline:**
- None configured (typical for Next.js on Render: git push → auto-deploy)

**Build Process:**
- `npm run build` compiles TypeScript and Next.js
- `npm run dev` runs local development server
- `npm run start` runs production server
- TypeScript strict mode enforced (tsconfig.json: strict: true)
- ESLint configuration implied but not visible in current files

## Environment Configuration

**Required env vars (must be present):**

**Google API:**
- `GOOGLE_CLIENT_ID` - Google OAuth application ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth application secret
- `GOOGLE_REFRESH_TOKEN` - Long-lived refresh token for offline access
- `GOOGLE_CALENDAR_ID` - Calendar to read/write appointments
- `GMAIL_USER` - Email address to send from (must be authorized in Google account)

**Clerk (MCP OAuth):**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Publishable key for frontend (starts with pk_test_ or pk_live_)
- `CLERK_SECRET_KEY` - Secret key for backend (starts with sk_test_ or sk_live_)

**Optional env vars:**
- `UPSTASH_REDIS_REST_URL` - Upstash Redis endpoint (graceful degradation if missing)
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `SENTRY_DSN` - Sentry error tracking (tracking disabled if missing)
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog analytics key (analytics disabled if missing)
- `NEXT_PUBLIC_POSTHOG_HOST` - PostHog custom host (optional, default PostHog US)

**Application Configuration:**
- `HOST_NAME` - Name of the appointment host (used in emails)
- `HOST_DOMAIN` - Domain name for booking page (used in CSP, CORS, MCP resource URL)
- `HOST_TIMEZONE` - Overrides Google Calendar timezone (IANA format, e.g. America/Toronto)
- `WORKING_HOURS_START` - Override calendar working hours (HH:MM format)
- `WORKING_HOURS_END` - Override calendar working hours (HH:MM format)
- `CONTACT_EMAIL` - Email for contact inquiries
- `DEFAULT_LOCATION` - Default meeting location/type
- `DEFAULT_ADDRESS` - Default meeting address

**Email Customization:**
- `DURATION_LABEL_15` - Label for 15-min meetings
- `DURATION_LABEL_30` - Label for 30-min meetings
- `DURATION_LABEL_60` - Label for 60-min meetings
- `DURATION_LABEL_120` - Label for 120-min meetings

**Booking Page:**
- `TOPIC_CHIPS` - Preset topic options (comma-separated or JSON)
- `LATE_MESSAGE_DELAY_MINUTES` - Minutes before start to show "too late to book" message

**Security:**
- `CRON_SECRET` - Webhook secret for scheduled tasks (generated with `openssl rand -hex 32`)

**Build Metadata:**
- `NEXT_PUBLIC_GIT_SHA` - Populated by Render.com `RENDER_GIT_COMMIT` (7 chars)

**Secrets location:**
- `.env.local` (git-ignored) - Development and sensitive variables
- Render.com environment settings (production)

## Webhooks & Callbacks

**Incoming:**
- None currently

**Outgoing:**
- Email confirmations to attendees via Gmail API
- Sentry error reporting to ingest endpoints

---

*Integration audit: 2026-03-24*
