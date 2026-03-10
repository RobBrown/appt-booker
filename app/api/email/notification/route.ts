import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  sendEmail,
  escapeHtml,
  formatDate,
  formatSummaryText,
  formatSummaryHtml,
} from "@/lib/gmail";
import { checkRateLimit, limiters } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(limiters.email, request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const {
      bookerName,
      bookerEmail,
      startTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      additionalAttendees = [],
      description = "",
    } = body;

    if (!bookerName || !bookerEmail || !startTime || !duration || !timezone || !locationType) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const start = new Date(startTime);
    const dateStr = formatDate(start, timezone);

    const summaryOpts = {
      bookerName,
      additionalAttendees,
      description,
      startTime: start,
      duration,
      timezone,
      locationType,
      locationDetails,
    };

    // ---------------------------------------------------------------------------
    // Plain text
    // ---------------------------------------------------------------------------
    const text = [
      `New booking: ${bookerName}`,
      ``,
      formatSummaryText(summaryOpts),
      ``,
      `Booker email: ${bookerEmail}`,
    ].join("\n");

    // ---------------------------------------------------------------------------
    // HTML
    // ---------------------------------------------------------------------------
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#111827">New booking: ${escapeHtml(bookerName)}</h1>

    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(summaryOpts)}
    </div>

    <p style="margin:16px 0 0;color:#6B7280;font-size:13px">Booker email: <a href="mailto:${escapeHtml(bookerEmail)}" style="color:#2563EB">${escapeHtml(bookerEmail)}</a></p>
  </div>
</body>
</html>`;

    const hostEmail = process.env.GMAIL_USER!;

    await sendEmail({
      to: hostEmail,
      subject: `New booking: ${bookerName} — ${dateStr}`,
      text,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Failed to send notification email." },
      { status: 500 }
    );
  }
}
