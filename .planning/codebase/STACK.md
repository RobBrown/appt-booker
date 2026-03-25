# Technology Stack

**Analysis Date:** 2026-03-24

## Languages

**Primary:**
- TypeScript 5 - All source code, strict mode enabled in `tsconfig.json`

**Secondary:**
- JavaScript - Configuration files (next.config.ts, sentry configs)

## Runtime

**Environment:**
- Node.js (version specified implicitly via Next.js 16)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework with App Router
  - Config: `next.config.ts` with Sentry integration and security headers
  - Streaming HTTP for MCP, rewrites for PostHog analytics
  - serverExternalPackages: `googleapis`, `gaxios`, `google-auth-library`, `node-fetch`

**Frontend:**
- React 19.2.3 - UI library
- React DOM 19.2.3 - DOM rendering

**UI Components:**
- Tailwind CSS 4 - Utility-first styling with PostCSS integration
- Radix UI 1.4.3 - Unstyled, accessible component primitives
- shadcn/ui 3.8.5 - Pre-built component library on Radix
- Lucide React 0.577.0 - Icon library
- class-variance-authority 0.7.1 - CSS class composition for component variants
- tailwind-merge 3.5.0 - Intelligent Tailwind class merging
- clsx 2.1.1 - Conditional class name utility
- @tailwindcss/forms 0.5.11 - Form element styling plugin

**Date/Time:**
- date-fns 4.1.0 - Date manipulation utilities
- date-fns-tz 3.2.0 - Timezone support for date-fns

**Testing:**
- vitest 4.0.18 - Vite-native unit test runner
  - Run tests: `npm run test`

**Build/Dev:**
- TypeScript 5 - Type checking and compilation
- ESM module system with bundler resolution

## Key Dependencies

**Critical:**
- googleapis 171.4.0 - Google Calendar and Gmail API client
  - Calendar API v3 for availability checking and event management
  - Gmail API v1 for sending confirmation/notification emails
  - OAuth 2.0 authorization via refresh token

- @clerk/nextjs 7.0.4 - Clerk authentication for Next.js
  - Used for MCP server OAuth token verification
  - Imports from @clerk/backend to avoid Turbopack bundling conflicts

- @clerk/mcp-tools 0.3.1 - Clerk integration with MCP (Model Context Protocol)
  - verifyClerkToken for OAuth token validation
  - generateClerkProtectedResourceMetadata for OAuth discovery

- mcp-handler 1.0.7 - MCP transport handler
  - Supports both Streamable HTTP and SSE transports
  - withMcpAuth wrapper for Clerk token verification
  - createMcpHandler for server initialization

- @modelcontextprotocol/sdk - MCP (Model Context Protocol) SDK (implicit via mcp-handler)
  - McpServer class for registering tools and resources
  - Tool and resource registration interfaces

**Infrastructure:**
- @upstash/ratelimit 2.0.8 - Redis-based rate limiting
  - Sliding window algorithm
  - 6 separate limiters for different endpoint groups
  - Handles graceful degradation when Redis unavailable

- @upstash/redis 1.36.4 - Redis client for Upstash serverless Redis
  - Connection via REST API (no TCP socket required)
  - ENV: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

- @sentry/nextjs 10.42.0 - Error tracking and performance monitoring
  - Server-side config: `sentry.server.config.ts`
  - Client-side config: `sentry.client.config.ts`
  - Edge config: `sentry.edge.config.ts`
  - ENV: `SENTRY_DSN`

- posthog-js 1.360.2 - Client-side product analytics
  - In-browser event tracking
  - ENV: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`

- posthog-node 5.28.2 - Server-side product analytics
  - Node.js API for server-side event tracking
  - OpenTelemetry log exporter integration

- @opentelemetry/sdk-logs 0.213.0 - OpenTelemetry logging SDK
- @opentelemetry/sdk-node 0.213.0 - OpenTelemetry Node.js SDK
- @opentelemetry/exporter-logs-otlp-http 0.213.0 - OTLP HTTP log exporter for PostHog Logs

**Validation:**
- zod 4.3.6 - TypeScript-first schema validation
  - Used for MCP tool parameter schemas
  - ENV variable validation on startup

## Configuration

**Environment:**
- .env.local (git-ignored) - Contains secrets and service credentials
- .env.example - Template with all required variables documented
- Environment variables are validated at module load via `lib/validate-env.ts`

**Key Config Files:**
- `next.config.ts` - Next.js configuration with security headers and Sentry integration
- `tsconfig.json` - TypeScript strict mode, path alias `@/*` for imports
- `tailwind.config.ts` (implicit) - Tailwind CSS configuration

**Security Headers (enforced globally):**
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- Strict-Transport-Security: 63072000s (2 years) with subdomains
- Content-Security-Policy: self-hosted scripts only (unsafe-inline for hydration), Google Fonts, Sentry ingest

## Platform Requirements

**Development:**
- Node.js (18+ recommended for Next.js 16)
- npm or yarn
- Google OAuth2 credentials (for Calendar/Gmail APIs)
- Clerk application instance with Google/Microsoft social login configured
- Optional: Upstash Redis for rate limiting (graceful fallback if missing)
- Optional: Sentry account for error tracking
- Optional: PostHog instance for analytics

**Production:**
- Render.com (as documented in CLAUDE.md)
- Environment variables for:
  - Google API (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)
  - Gmail (GMAIL_USER)
  - Clerk (CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)
  - Upstash Redis (optional)
  - Sentry (optional)
  - PostHog (optional)
- Build output: `.next` directory

---

*Stack analysis: 2026-03-24*
