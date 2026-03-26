import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPLogExporter } = await import(
      "@opentelemetry/exporter-logs-otlp-http"
    );
    const { SimpleLogRecordProcessor } = await import(
      "@opentelemetry/sdk-logs"
    );

    const posthogHost =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

    const sdk = new NodeSDK({
      logRecordProcessors: [
        new SimpleLogRecordProcessor(
          new OTLPLogExporter({
            url: `${posthogHost}/v1/otel/v1/logs`,
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_POSTHOG_KEY}`,
            },
          })
        ),
      ],
    });

    sdk.start();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  // Dynamically import to avoid bundling posthog-node in non-Node runtimes
  const { getPostHogClient } = await import("./lib/posthog-server");
  const posthog = getPostHogClient();

  await posthog.captureExceptionImmediate(error, "server", {
    $request_path: request.path,
    $request_method: request.method,
    router_kind: context.routerKind,
    route_path: context.routePath,
    route_type: context.routeType,
    ...(context.renderSource ? { render_source: context.renderSource } : {}),
  });
};
