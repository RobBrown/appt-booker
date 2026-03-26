import * as Sentry from "@sentry/nextjs";

const PII_KEYS = new Set([
  "bookerEmail",
  "bookerPhone",
  "bookerName",
  "additionalAttendees",
  "email",
  "phone",
  "to",
  "cc",
  "authorization",
]);

function scrub(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_KEYS.has(key)) {
      cleaned[key] = "[Filtered]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = scrub(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
    }
    if (event.request?.data && typeof event.request.data === "object") {
      event.request.data = scrub(
        event.request.data as Record<string, unknown>
      );
    }
    if (event.extra) {
      event.extra = scrub(event.extra as Record<string, unknown>);
    }
    return event;
  },
});
