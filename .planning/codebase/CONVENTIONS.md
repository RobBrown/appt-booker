# Coding Conventions

**Analysis Date:** 2025-03-24

## Naming Patterns

**Files:**
- All lowercase with hyphens for word separation: `check-availability.ts`, `date-time-step.tsx`
- React components: PascalCase in filename and export (e.g., `BookingPage.tsx` exports `BookingPage`)
- Utility/service files: kebab-case, lowercase exports (e.g., `google-auth.ts`)
- Test files: same name as source with `.test.ts` suffix (e.g., `gmail.test.ts`)

**Functions:**
- camelCase: `getAvailableSlots()`, `sanitizeHeader()`, `formatDateTimeLine()`
- async functions followed same convention, no prefix: `async function getAvailability(...)`
- Internal helper functions: lowercase with clear intent (e.g., `withRetry()`, `findEventByToken()`)
- React hook-like functions in components: PascalCase (component naming)
- Exported tool registration functions: `registerCheckAvailability()`, `registerCreateBooking()`

**Variables:**
- camelCase: `hostTimezone`, `selectedDate`, `bookerEmail`, `durationMs`
- Constants in scope: uppercase with underscores for module-level constants: `VALID_DURATIONS`, `DEFAULT_WORKING_PERIODS`, `MUTATING_METHODS`
- React state setters: `setConfirmed()`, `setSelectedDate()` following React convention
- Type-specific prefixes: `busyPeriods` (array), `isBusy` (boolean), `userEmail` (string)

**Types:**
- Interfaces: PascalCase, descriptive (e.g., `BusyPeriod`, `CreateBookingParams`, `ToolCallLogEntry`)
- Type aliases: PascalCase (e.g., `ValidDuration`)
- Generic type parameters: single letter or descriptive (e.g., `<T>`, `<CalendarClient>`)
- Schema objects (Zod): Lowercase with "Schema" suffix (e.g., `checkAvailabilitySchema`, `createBookingSchema`)

## Code Style

**Formatting:**
- TypeScript + Next.js default (likely prettier via Next.js config)
- No .eslintrc or .prettierrc files present — using Next.js defaults
- Indentation: 2 spaces (evident from all source files)
- Line length: generally kept under 100 characters, but tool descriptions can extend further

**Linting:**
- No explicit linter config found (Next.js built-in eslint used)
- Strict mode enabled in tsconfig: `"strict": true`
- Type checking enforced: `"noEmit": true` (never emit JS, only check types)

## Import Organization

**Order:**
1. Standard library/Node.js imports (e.g., `import { addMinutes } from "date-fns"`)
2. External third-party packages (e.g., `import { google } from "googleapis"`, `import * as Sentry from "@sentry/nextjs"`)
3. Internal aliases (e.g., `import { getCalendarClient } from "@/lib/google-auth"`)
4. Relative sibling imports within same module (e.g., in MCP tools: other MCP utilities)

**Path Aliases:**
- Single `@` prefix maps to project root: `@/*` → `./`
- Used consistently: `@/lib/...`, `@/components/...`, `@/app/...`
- Never relative imports like `../../../` in main code (only in tests with mocks)

**Example patterns:**
- API routes: standard lib, next, external (googleapis, date-fns), then internal
- Components: React/next, external UI libs (lucide-react), then internal
- Services: internal dependencies, then external (date-fns, googleapis)

## Error Handling

**Patterns:**
- Try/catch wrapping async operations: all API routes wrap main logic in try/catch
- Silent fallback on non-critical errors: calendar settings fallback to defaults (lines 50-90 in `lib/availability.ts`)
- Structured error classes for service functions:
  - `ConflictError` (409): slot already booked
  - `NotFoundError` (404): booking not found
  - `CalendarApiError` (503): Google Calendar unreachable
  - Errors include `statusCode` property for direct HTTP response
- Console logging for debugging: `console.error("[context]")` prefix for context
- Sentry integration: errors captured via `Sentry.captureException()` in route handlers
- MCP tools: errors caught and returned as `{ isError: true, content: [...] }` response shape, never thrown

## Logging

**Framework:** `console` methods (no external logging library)

**Patterns:**
- Info/debug: `console.info()` for routine operations (MCP tool calls)
- Errors: `console.error()` for actual failures with context tag (e.g., `[availability]`)
- Tool logging: specialized via `logToolCall()` in `lib/mcp/logger.ts`
- Log format: `[CONTEXT] message` (e.g., `[availability] error: ...`)
- PostHog integration: event tracking via `posthog.capture()` in components

**Tool call logging** (MCP specific):
- Location: `lib/mcp/logger.ts`
- Fields: tool name, authenticated user email, status (success/error), duration in ms
- Deliberately excludes: request bodies, tokens, sensitive data
- Used in every MCP tool handler

## Comments

**When to Comment:**
- Complex business logic: timezone calculations commented (e.g., "Full day in booker's timezone as UTC range")
- Non-obvious decisions: "All-day events are not reliably included in freebusy — add them explicitly"
- Clarification of workarounds: "Fall through to defaults" on calendar API failures
- Security-related code: CSRF guards, injection prevention comments
- Middleware decisions: Clerk not used in middleware (documented in `middleware.ts`)

**JSDoc/TSDoc:**
- Used for public functions and types
- Service functions have JSDoc describing parameters and return types
- Interface/type definitions lack JSDoc unless non-obvious
- Tool registration functions documented with purpose
- Example from `lib/mcp/logger.ts`:
  ```typescript
  /**
   * Logs tool name, user email, status, and timing.
   * Deliberately does NOT log request bodies, tokens, or other sensitive data.
   */
  ```

**Documentation blocks:**
- Inline docstrings for module purpose (e.g., service files explain what they export)
- Section separators: `// ---------------------------------------------------------------------------`
- Descriptive headers: `// Shared helpers`, `// Schema validation`, `// Error handling`

## Function Design

**Size:** Functions generally 30-100 lines for core logic; smaller helpers (5-20 lines) for pure utilities
  - `getAvailableSlots()`: 57 lines (complex timezone + scheduling logic)
  - `sanitizeHeader()`: 1 line (pure utility)
  - `buildIcs()`: 22 lines (data transformation)

**Parameters:**
- Prefer named object destructuring over positional args for functions with 3+ parameters
- Example: `CreateBookingParams` interface unpacked in handler
- Simple utility functions can use positional args (e.g., `escapeIcsText(value: string)`)
- Service functions receive a single options object: `getAvailability(options)`, `createBooking(params)`

**Return Values:**
- Explicit types always (strict mode enforced)
- Async functions return Promise<T> wrapped types
- Service functions return typed objects or throw custom errors
- API route handlers return `NextResponse` or its result directly
- React hooks return state arrays `[value, setter]` or objects

## Module Design

**Exports:**
- Named exports (no default exports in utility modules)
- Services export main functions + types + error classes
- React components export as default or named; tend to use named exports when module exports multiple
- Zod schemas exported as named objects: `export const checkAvailabilitySchema = { ... }`
- Registrator functions: `export function registerCheckAvailability(server: McpServer)`

**Barrel Files:**
- Not used for services or utilities (each service has single export location)
- `components/ui/` likely uses barrel pattern if `components/ui/index.ts` exists

**File organization in lib/**:
- `lib/services/` — shared business logic for API + MCP
- `lib/mcp/` — MCP-specific code (tools, resources, server registration, logger)
- `lib/mcp/tools/` — individual tool implementations
- `lib/mcp/resources/` — MCP resources
- `lib/mcp/__tests__/` — unit tests for MCP tools
- `lib/__tests__/` — unit tests for lib utilities (validation, middleware, email, etc.)
- Root `lib/` — helpers and integrations (gmail, google-auth, availability, zoom, rate-limit, etc.)

## Validation

**Input validation:**
- Regex patterns for email: `/^[^\s@]{1,200}@[^\s@]{1,200}\.[^\s@]{1,50}$/` (loose but sufficient)
- Duration enum: `[15, 30, 60, 120]` — explicit const array checked via `includes()`
- Timezone: `Intl.supportedValuesOf("timeZone").includes(tz)` or hardcoded "UTC"
- Length checks: `string.length > max` for names, emails, phone, descriptions
- Date format: regex check for ISO date `^\d{4}-\d{2}-\d{2}$`
- Zod schemas in MCP: `z.string().regex(...)`, `z.union([z.literal(15), ...])`, `z.string().default(...)`

**Injection prevention:**
- CRLF/LF stripping in email headers: `value.replace(/[\r\n]/g, "")`
- ICS escaping: backslash, semicolon, comma, newline replaced
- HTML escaping: `escapeHtml()` for user-provided text in emails
- Timezone validation prevents log injection (tests confirm rejection of `\r\n` sequences)

## Error Messages

**Style:**
- User-facing: plain language, no implementation details
- Example: "Missing required fields." (not "startTime undefined")
- Example: "Failed to fetch availability." (not "getFreebusyRes threw TypeError")
- Internal: more detail via console.error with context

## TypeScript Patterns

**Type safety:**
- No `any` usage
- Generic constraints used: `function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T>`
- Record types for mappings: `Record<string, string>` for label maps
- Union literals for enums: `z.union([z.literal(15), z.literal(30), ...])`

**Utility types:**
- `ReturnType<typeof getCalendarClient>` for extracting calendar client type
- Type aliases for domain concepts: `type ValidDuration = (typeof VALID_DURATIONS)[number]`

## Environment Variables

**Access pattern:**
- Direct `process.env.VARIABLE_NAME` in runtime code
- Type-checked via `lib/validate-env.ts` at startup (test covers validation)
- Fallback behavior: `process.env.HOST_TIMEZONE || "UTC"`
- Dynamic config from env: duration labels built from `DURATION_LABEL_${minutes}` vars

## Async Patterns

**Promise handling:**
- `async/await` throughout (no .then chains)
- `Promise.all()` for parallel operations: `await Promise.all([getHostTimezone(...), getWorkingPeriods(...)])`
- Retries: custom `withRetry()` helper with exponential backoff `Math.pow(2, attempt) * 1000`
- Rate limiting: separate `checkRateLimit()` call at route entry point before main logic

## React Patterns

**Component structure:**
- Functional components with hooks (no class components)
- Props passed as object, often destructured in parameters
- State initialized with callbacks for computed defaults (e.g., `useState<number | null>(() => { const d = searchParams.get("duration"); return d ? Number(d) : null; })`)
- Event handlers: `useCallback` for expensive operations
- Side effects: `useEffect` for data fetching or integrations (PostHog tracking)

**Event handling:**
- Event handlers named `on{Event}`: `onSelect()`, `onClick()`
- Handlers inline as arrow functions in JSX

---

*Convention analysis: 2025-03-24*
