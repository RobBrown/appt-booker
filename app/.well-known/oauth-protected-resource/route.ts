/**
 * OAuth 2.0 Protected Resource Metadata endpoint (RFC 9728).
 *
 * Required by MCP clients to discover the authorization server.
 * This route MUST be publicly accessible — no auth required.
 * The Clerk middleware is configured to leave /.well-known/* unprotected.
 */

import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { metadataCorsOptionsRequestHandler } from "mcp-handler";

function getResourceUrl(req: Request): string {
  // In development, always use the request origin (e.g. http://localhost:3000)
  // so MCP clients can discover the OAuth server without hitting the production
  // domain. In production, NODE_ENV is "production" and HOST_DOMAIN is set.
  if (process.env.NODE_ENV === "production" && process.env.HOST_DOMAIN) {
    return `https://${process.env.HOST_DOMAIN}`;
  }
  const url = new URL(req.url);
  return url.origin;
}

export async function GET(req: Request) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;
  const resourceUrl = getResourceUrl(req);

  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl,
  });

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // CORS required so browser-based MCP clients can fetch this
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      // Cache for 1 hour — metadata is static
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// Handle preflight OPTIONS requests from browser MCP clients
export const OPTIONS = metadataCorsOptionsRequestHandler();
