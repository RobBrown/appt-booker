import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    const { init } = await import("@hal866245/observability-core");
    init();
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
