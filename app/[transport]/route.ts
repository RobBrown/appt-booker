/**
 * MCP transport route.
 *
 * Handles both Streamable HTTP (/mcp) and legacy SSE (/sse) via the [transport]
 * dynamic segment, as required by mcp-handler.
 *
 * Authentication is performed on every request via Clerk OAuth tokens.
 * The withMcpAuth wrapper returns 401 for unauthenticated requests before
 * the MCP handler ever sees the request.
 *
 * NOTE: We use @clerk/backend directly instead of @clerk/nextjs/server for
 * token verification. @clerk/nextjs/server imports next/server (NextResponse
 * etc.) which, when bundled by Turbopack in the app-route context alongside
 * the middleware compilation context, creates two separate Response class
 * instances. This breaks the `instanceof Response` check that Next.js performs
 * on API route handler return values, causing all API routes to return 500
 * "No response is returned from route handler".
 *
 * @clerk/backend does NOT import next/server, so it is safe to import here.
 */

import { createClerkClient } from "@clerk/backend";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyClerkToken } from "@clerk/mcp-tools/server";
import { initializeMcpServer } from "@/lib/mcp/server";

const mcpHandler = createMcpHandler(
  (server) => {
    initializeMcpServer(server);
  },
  {
    serverInfo: { name: "rob-brown-appointments", version: "1.0.0" },
  },
  {
    // [transport] is at the root level of app/, so basePath is "/"
    basePath: "/",
    maxDuration: 60,
    verboseLogs: false,
  }
);

// Lazy-init Clerk client (avoids creating it at module load time)
let _clerk: ReturnType<typeof createClerkClient> | null = null;
function getClerk() {
  if (!_clerk) {
    _clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    });
  }
  return _clerk;
}

async function verifyToken(req: Request, bearerToken?: string) {
  // Use @clerk/backend to authenticate the request as an OAuth token.
  // authenticateRequest() validates the bearer token and returns an auth state
  // object with the same shape that verifyClerkToken expects.
  const requestState = await getClerk().authenticateRequest(req, {
    acceptsToken: "oauth_token",
  });
  // toAuth() converts the request state to the auth object expected by verifyClerkToken
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerkAuth = (requestState as any).toAuth();
  // verifyClerkToken returns AuthInfo if valid, undefined if not
  return verifyClerkToken(clerkAuth, bearerToken);
}

const handler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
  // In dev, omit resourceUrl so withMcpAuth derives it from the request origin.
  // In production, use the configured domain.
  resourceUrl:
    process.env.NODE_ENV === "production" && process.env.HOST_DOMAIN
      ? `https://${process.env.HOST_DOMAIN}`
      : undefined,
});

export { handler as GET, handler as POST, handler as DELETE };
