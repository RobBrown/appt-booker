import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const provided = authHeader ?? "";
  const expected = cronSecret ? `Bearer ${cronSecret}` : "";
  const authorised =
    cronSecret &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!authorised) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const workflow = String(raw.workflow ?? "unknown").slice(0, 200);
  const runUrl = String(raw.run_url ?? "").slice(0, 2000);

  Sentry.captureMessage(`GitHub Actions workflow "${workflow}" failed`, {
    level: "error",
    tags: { workflow, source: "github-actions" },
    extra: { run_url: runUrl },
  });

  await Sentry.flush(2000);

  return NextResponse.json({ ok: true });
}
