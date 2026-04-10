import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  // Prevent the page from being embedded in an iframe
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent browsers from guessing content types
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer data on cross-origin requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features this app does not use
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Force HTTPS for two years; include subdomains
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Content Security Policy
  // Note: 'unsafe-inline' for scripts is required by Next.js hydration and the
  // inline dark-mode detection script. A nonce-based CSP would eliminate this
  // but requires additional refactoring.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      // Google Fonts CSS (used as fallback in dev; next/font self-hosts in prod)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Google Fonts files
      "font-src 'self' data: https://fonts.gstatic.com",
      // Avatar and any data URIs
      "img-src 'self' data:",
      // Browser-side fetch calls to our own API + Sentry error reporting
      "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
      // Prevent base tag injection
      "base-uri 'self'",
      // Restrict form submissions to same origin
      "form-action 'self'",
      // Belt-and-suspenders alongside X-Frame-Options
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.RENDER_GIT_COMMIT?.substring(0, 7) ?? "dev",
  },
  // googleapis and its transitive deps (gaxios, node-fetch) must stay external
  // so Turbopack does not bundle a second copy of node-fetch's Response class
  // into the server chunks. Bundling causes an instanceof Response mismatch
  // between the route handler (which uses the bundled Response) and
  // AppRouteRouteModule (which uses the native global Response).
  serverExternalPackages: [
    "googleapis",
    "gaxios",
    "google-auth-library",
    "node-fetch",
    "@robbrown/observability-core",
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "@opentelemetry/sdk-logs",
    "@opentelemetry/sdk-metrics",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/exporter-logs-otlp-http",
    "@opentelemetry/exporter-metrics-otlp-http",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
    "@opentelemetry/api-logs",
  ],
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
