import { NextRequest, NextResponse } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  if (!MUTATING_METHODS.has(req.method)) {
    return NextResponse.next();
  }

  const origin = req.headers.get("origin");

  // Requests with no Origin header come from same-origin navigations or
  // server-to-server calls (e.g. the cron job). Allow them through.
  if (!origin) {
    return NextResponse.next();
  }

  const hostDomain = process.env.HOST_DOMAIN;
  const allowedOrigins = new Set([
    ...(hostDomain ? [`https://${hostDomain}`, `http://${hostDomain}`] : []),
    "http://localhost:3000",
  ]);

  if (!allowedOrigins.has(origin)) {
    return new NextResponse(null, {
      status: 403,
      statusText: "Forbidden",
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
