import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@hal866245/observability-core";

const log = logger.child({ service: "rate-limit" });

// ---------------------------------------------------------------------------
// Redis client — created only when env vars are present
// ---------------------------------------------------------------------------

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = createRedis();

// ---------------------------------------------------------------------------
// Limiters — one per endpoint group, using sliding window algorithm
// ---------------------------------------------------------------------------

function makeLimiter(prefix: string, requests: number, window: Duration): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `rl:${prefix}`,
  });
}

export const limiters = {
  availability:   makeLimiter("availability",   60, "1 m"),
  bookings:       makeLimiter("bookings",        10, "10 m"),
  email:          makeLimiter("email",           10, "10 m"),
  meetingsCreate: makeLimiter("meetings-create", 20, "10 m"),
  manageRead:     makeLimiter("manage-read",     20, "1 m"),
  manageWrite:    makeLimiter("manage-write",    10, "10 m"),
};

// ---------------------------------------------------------------------------
// Service-down response — returned when Upstash is unreachable
// ---------------------------------------------------------------------------

export function serviceDownResponse(): NextResponse {
  return NextResponse.json(
    {
      code: "RATE_LIMIT_SERVICE_DOWN",
      error:
        "This booking application relies on Upstash for rate limiting. " +
        "Upstash is currently experiencing a service disruption, which is " +
        "preventing the application from processing requests. Normal operation " +
        "will resume automatically once Upstash service is restored.",
    },
    { status: 503 }
  );
}

// ---------------------------------------------------------------------------
// checkRateLimit — call at the top of each API route handler
//
// Returns null if the request should proceed.
// Returns a NextResponse (429 or 503) if it should be blocked.
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  limiter: Ratelimit | null,
  req: NextRequest
): Promise<NextResponse | null> {
  if (!redis || !limiter) {
    return serviceDownResponse();
  }

  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "anonymous";
    const { success } = await limiter.limit(ip);

    if (!success) {
      log.warn("Rate limit hit", { route: req.nextUrl.pathname });
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    return null;
  } catch (err) {
    log.error("Rate limiter error", { error: String(err), route: req.nextUrl.pathname });
    Sentry.captureException(err);
    return serviceDownResponse();
  }
}
