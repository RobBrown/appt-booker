/**
 * Next.js middleware.
 *
 * Handles CORS guard for /api/* routes — blocks cross-origin POST/PATCH/DELETE
 * requests from unrecognised origins.
 *
 * The guard logic is extracted into the named `middleware` export so existing
 * unit tests can call it synchronously without the full middleware wrapper.
 *
 * NOTE on Clerk: clerkMiddleware is intentionally omitted here.
 *
 *   - The MCP transport route (/mcp, /sse) handles its own authentication
 *     via withMcpAuth + verifyClerkToken directly in the route handler.
 *     Clerk's auth() works in "standalone" mode (without clerkMiddleware) by
 *     reading the Authorization header directly, which is exactly what
 *     withMcpAuth passes.
 *   - The existing booking API routes (/api/*) do not use Clerk auth().
 *   - The booking UI (/) does not require Clerk.
 *
 *   Adding clerkMiddleware here causes Turbopack to create a shared bundle
 *   context between the middleware and app-route compilation units that splits
 *   the Response class into two separate instances. This breaks the
 *   `instanceof Response` check that Next.js performs on route handler return
 *   values, causing all API routes to return 500 "No response is returned".
 *
 * Paths that must remain fully public:
 *   /.well-known/*  — OAuth discovery, no auth required
 *   /mcp            — auth handled by withMcpAuth inside the route handler
 *   /sse            — same
 *   /               — booking UI, public
 *   /api/*          — CORS-guarded but not auth-restricted
 */

import { NextRequest, NextResponse } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

/**
 * CORS guard for /api/* routes.
 *
 * Named export so it can be unit-tested independently (the existing test
 * suite imports this directly and calls it synchronously).
 */
export function middleware(req: NextRequest): NextResponse {
  if (MUTATING_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");

    // No Origin header = same-origin navigation or server-to-server call
    // (e.g. the cron job). Allow.
    if (origin) {
      const hostDomain = process.env.HOST_DOMAIN;
      const allowedOrigins = new Set([
        ...(hostDomain ? [`https://${hostDomain}`, `http://${hostDomain}`] : []),
        "http://localhost:3000",
      ]);

      if (!allowedOrigins.has(origin)) {
        return new NextResponse(null, { status: 403, statusText: "Forbidden" });
      }
    }
  }

  return NextResponse.next();
}

/**
 * Default export used by Next.js at runtime.
 *
 * Applies CORS guard to /api/* routes only; all other paths pass through.
 */
export default function handler(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const corsResult = middleware(req);
    if (corsResult.status === 403) return corsResult;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run middleware on all paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
