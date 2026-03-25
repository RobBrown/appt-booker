# Testing Patterns

**Analysis Date:** 2025-03-24

## Test Framework

**Runner:**
- Vitest 4.0.18
- Config: `vitest.config.ts`
- Run commands:
  ```bash
  npm run test                  # Run all tests (one-off, no watch)
  npm run test -- --watch      # Watch mode
  npm run test -- --coverage   # Coverage report (if configured)
  ```

**Assertion Library:**
- Vitest built-in assertions via `expect()` API (standard Jest/Vitest compatible)
- No additional assertion libraries detected

## Test File Organization

**Location:** Colocated with tested modules in `__tests__` directory
  - `lib/__tests__/` — tests for lib utilities
  - `lib/mcp/__tests__/` — tests for MCP tools and schemas
  - Not: separate `__tests__` folder at project root

**Naming:**
- Pattern: `[module-name].test.ts`
- Examples: `gmail.test.ts`, `cron-auth.test.ts`, `tools.test.ts`

**Structure:**
```
lib/
├── __tests__/
│   ├── availability-route.test.ts
│   ├── cron-auth.test.ts
│   ├── email-validation.test.ts
│   ├── gmail.test.ts
│   ├── input-length.test.ts
│   ├── middleware.test.ts
│   └── validate-env.test.ts
├── mcp/
│   └── __tests__/
│       └── tools.test.ts
└── [source files]
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("feature or function name", () => {
  // Optional setup
  beforeEach(() => {
    // Runs before each test in this suite
  });

  afterEach(() => {
    // Cleanup
  });

  it("should do X under condition Y", () => {
    // Arrange
    const input = ...;

    // Act
    const result = fn(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

**Patterns:**
- One `describe()` per test file per feature/function
- Multiple `it()` blocks for different scenarios (happy path, edge cases, errors)
- Test names start with "should" or state expected behavior: "accepts valid params", "rejects a missing Authorization header"
- Setup via `beforeEach()` and cleanup via `afterEach()`
- Sections within tests marked with comments: `// --- Valid inputs ---`, `// --- Invalid inputs ---`

**Examples from codebase:**

From `lib/__tests__/cron-auth.test.ts`:
```typescript
describe("cron authorisation", () => {
  // --- Authorised ---
  it("allows a correct Bearer token", () => {
    expect(isAuthorised(SECRET, `Bearer ${SECRET}`)).toBe(true);
  });

  // --- Unauthorised ---
  it("rejects a missing Authorization header", () => {
    expect(isAuthorised(SECRET, null)).toBe(false);
  });
  // ... more tests
});
```

From `lib/__tests__/gmail.test.ts`:
```typescript
describe("sanitizeHeader", () => {
  // --- Clean input ---
  it("passes through a plain name unchanged", () => {
    expect(sanitizeHeader("Jane Smith")).toBe("Jane Smith");
  });

  // --- Injection via \r\n (CRLF) ---
  it("strips CRLF from fromName to prevent BCC injection", () => {
    const input = "Jane Smith\r\nBCC: attacker@evil.com";
    expect(sanitizeHeader(input)).toBe("Jane Smith" + "BCC: attacker@evil.com");
  });
});
```

## Mocking

**Framework:** Vitest's `vi` object
  - `vi.mock()` — mock entire modules
  - `vi.fn()` — create spy functions
  - `vi.spyOn()` — spy on existing functions

**Patterns:**

Full module mocks (prevent calendar API calls):
```typescript
vi.mock("@/lib/services/availability", () => ({
  getAvailability: vi.fn(),
}));

vi.mock("@/lib/google-auth", () => ({
  getCalendarClient: vi.fn(),
}));
```

Partial mocks with mock classes (override validate-env to skip env validation):
```typescript
vi.mock("@/lib/validate-env", () => ({}));
```

**What to Mock:**
- Google Calendar API client functions (prevent real calendar calls)
- Service layer functions in MCP tool tests (to test parameter validation in isolation)
- `validate-env` module when testing functions that would fail without all env vars set
- Custom Error classes with statusCode properties (for testing error paths)

**What NOT to Mock:**
- Pure utility functions (`sanitizeHeader`, `escapeIcsText`, `formatDate`)
- Zod schema parsing (test real validation)
- Date/time functions from `date-fns` (test timezone logic)
- Crypto functions like `timingSafeEqual` (test real auth logic)

## Fixtures and Factories

**Test Data:**
- Hardcoded constants in test files (no external fixture files)
- Example from `cron-auth.test.ts`: `const SECRET = "abc123"`
- Example from `timezone-validation.test.ts`: explicit timezone strings like `"America/New_York"`

**Location:** Inline in each test file; no shared fixture directory

**Pattern:** Data defined near top of test suite, used across multiple test cases:
```typescript
const SECRET = "abc123";

describe("cron authorisation", () => {
  it("allows a correct Bearer token", () => {
    expect(isAuthorised(SECRET, `Bearer ${SECRET}`)).toBe(true);
  });
});
```

**Mock data for routes:** `lib/mock-data.ts` exists but not used in tests (contains static data for development/display)

## Coverage

**Requirements:** No coverage threshold enforced (not configured in `vitest.config.ts`)

**View Coverage:** Not configured in current setup (would add `--coverage` flag if enabled)

**Current approach:** Selective testing of critical paths:
- Security: validation, injection prevention (comprehensive)
- Business logic: availability calculation, timezone handling (comprehensive)
- Error handling: service function error propagation (comprehensive via MCP tool tests)
- Integration: minimal (mock external dependencies)

## Test Types

**Unit Tests:**
- **Scope:** Individual functions and pure logic
- **Approach:** Test function inputs → outputs without side effects
- **Examples:**
  - `sanitizeHeader()` with various injection attempts
  - Timezone validation with IANA timezone strings
  - Cron auth token verification
  - Email validation regex
  - Middleware CORS logic
- **Data:** Hardcoded test cases, no database or API calls
- **Location:** `lib/__tests__/` and `lib/mcp/__tests__/`

**Integration Tests:**
- **Scope:** Service layer with mocked external dependencies
- **Approach:** Test full MCP tool handler with mocked calendar client
- **Example:** `lib/mcp/__tests__/tools.test.ts` tests schema validation + error handling + logging for all 5 tools
- **Mocks:** Service functions and calendar client mocked to prevent real API calls
- **Coverage:** Parameter validation → handler logic → response shape

**E2E Tests:**
- **Framework:** Not used in current codebase
- **Rationale:** Calendar integration tested manually or via staging environment
- **Note:** Full end-to-end booking flow (create → reschedule → cancel) requires live credentials and would hit rate limits

## Common Patterns

**Async Testing:**
```typescript
// Tests automatically wait for async functions via await
it("should fetch and return data", async () => {
  const result = await asyncFn();
  expect(result).toBe(expected);
});
```

**Error Testing:**
```typescript
// Test what happens when service throws
vi.mocked(getAvailability).mockRejectedValueOnce(new Error("Calendar unreachable"));

const result = await checkAvailabilityTool({ date, duration, timezone }, extra);
expect(result.isError).toBe(true);
expect(result.content[0].text).toContain("Error: Calendar unreachable");
```

**Schema Validation Testing:**
```typescript
// Parse Zod schema and check success/failure
function parseSchema(shape: Record<string, z.ZodTypeAny>, data: unknown) {
  return z.object(shape).safeParse(data);
}

it("accepts valid params", () => {
  const result = parseSchema(checkAvailabilitySchema, {
    date: "2026-03-15",
    duration: 30,
    timezone: "America/Toronto",
  });
  expect(result.success).toBe(true);
});

it("rejects invalid duration", () => {
  const result = parseSchema(checkAvailabilitySchema, {
    date: "2026-03-15",
    duration: 99,  // Not in enum
    timezone: "America/Toronto",
  });
  expect(result.success).toBe(false);
});
```

**Mocking and Testing Tool Handlers:**
```typescript
// From lib/mcp/__tests__/tools.test.ts
vi.mock("@/lib/services/availability", () => ({
  getAvailability: vi.fn(),
}));

it("calls getAvailability with parsed params", async () => {
  const mockFn = vi.mocked(getAvailability);
  mockFn.mockResolvedValueOnce({
    date: "2026-03-15",
    duration: 30,
    timezone: "America/Toronto",
    slots: ["09:00", "10:00"],
  });

  // Import and call the tool handler
  const result = await checkAvailabilityHandler(
    { date: "2026-03-15", duration: 30, timezone: "America/Toronto" },
    { authInfo: { email: "user@example.com" } }
  );

  expect(mockFn).toHaveBeenCalledWith({
    date: "2026-03-15",
    duration: 30,
    timezone: "America/Toronto",
  });
});
```

## Test Categories

**Security/Validation Tests** (`lib/__tests__/`):
- `gmail.test.ts` — header sanitization (CRLF injection prevention, 10+ cases)
- `middleware.test.ts` — CORS guard (GET allowed, POST origin checking, 114 lines)
- `email-validation.test.ts` — email format validation
- `input-length.test.ts` — input length limits for booking fields
- `cron-auth.test.ts` — Bearer token validation with timing-safe comparison
- `validate-env.test.ts` — environment variable validation

**Business Logic Tests** (`lib/__tests__/` and `lib/mcp/__tests__/`):
- `availability-route.test.ts` — timezone validation, IANA timezone support
- `tools.test.ts` (MCP) — all 5 tool schemas, error handling, logging (308 lines, comprehensive)

## Patterns to Follow When Adding Tests

1. **Place test file** in `__tests__` sibling to source
2. **Name test file** matching source: `my-util.ts` → `my-util.test.ts`
3. **Structure** with describe → it blocks, grouped by category
4. **Mock externals** (Google Calendar, services) to keep tests isolated and fast
5. **Test both success and failure** paths
6. **Validate input** via Zod schemas — test the schema itself
7. **Check error messages** for user-facing errors (no implementation leakage)
8. **Use hardcoded test data** inline, not external fixtures
9. **Avoid testing framework dependencies** (test the code, not the mock)
10. **Keep tests focused** — one describe per feature, one it per scenario

## Current Test Coverage Gaps

**Not tested:**
- Full end-to-end booking flow (create → confirm → email → calendar event)
- Zoom integration (`lib/zoom.ts`) — not covered
- Google Auth setup (`lib/google-auth.ts`) — not covered
- PostHog tracking (`lib/posthog-server.ts`) — not covered
- React components (`components/booking/`) — no component tests
- API route handlers in full (`app/api/*`) — test logic via service layer instead
- Email rendering (`renderEmailHtml()`) — complex HTML generation untested
- Rate limiting (`lib/rate-limit.ts`) — not covered

**Rationale:** Focus on unit testing critical paths (validation, auth, timezone logic) and mocking external dependencies. Component and integration testing would require fuller infrastructure or would be brittle.

---

*Testing analysis: 2025-03-24*
