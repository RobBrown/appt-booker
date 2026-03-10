import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { sendEmail, escapeHtml, formatDate, formatTime, formatSummaryText, formatSummaryHtml } from "@/lib/gmail";
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
    } = body;

    if (!bookerName || !bookerEmail || !startTime || !duration || !timezone || !locationType) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const start = new Date(startTime);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostDomain = process.env.HOST_DOMAIN ?? "";
    const dateStr = formatDate(start, timezone);
    const timeStr = formatTime(start, timezone);

    const summaryOpts = {
      bookerName,
      startTime: start,
      duration,
      timezone,
      locationType,
      locationDetails,
    };

    // -------------------------------------------------------------------------
    // Email to booker
    // -------------------------------------------------------------------------
    const bookerText = [
      `Hi ${bookerName},`,
      ``,
      `Your ${duration}-minute meeting with ${hostName} on ${dateStr} at ${timeStr} has been cancelled.`,
      ``,
      ...(hostDomain ? [`If you'd like to book another time:`, hostDomain] : []),
    ].join("\n");

    const bookerHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827">Booking cancelled</h1>
    <p style="margin:0 0 28px;color:#6B7280">Your meeting with ${hostName} has been cancelled.</p>
    ${hostDomain ? `
    <div style="margin:32px 0;border-top:1px solid #E5E7EB"></div>
    <p style="margin:0 0 12px;color:#6B7280;font-size:14px">Need to book a new time?</p>
    <a href="${hostDomain}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">Book another time</a>
    ` : ""}
  </div>
</body>
</html>`;

    await sendEmail({
      to: bookerEmail,
      subject: `Your meeting with ${hostName} has been cancelled`,
      text: bookerText,
      html: bookerHtml,
    });

    // -------------------------------------------------------------------------
    // Email to host
    // -------------------------------------------------------------------------
    const hostText = [
      `Cancelled: ${bookerName}`,
      ``,
      formatSummaryText(summaryOpts),
      ``,
      `Booker email: ${bookerEmail}`,
    ].join("\n");

    const hostHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#111827">Cancelled: ${escapeHtml(bookerName)}</h1>

    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(summaryOpts)}
    </div>

    <p style="margin:16px 0 0;color:#6B7280;font-size:13px">Booker email: <a href="mailto:${escapeHtml(bookerEmail)}" style="color:#2563EB">${escapeHtml(bookerEmail)}</a></p>
  </div>
</body>
</html>`;

    await sendEmail({
      to: process.env.GMAIL_USER!,
      subject: `Cancelled: ${bookerName} — ${dateStr} at ${timeStr}`,
      text: hostText,
      html: hostHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to send cancellation emails." }, { status: 500 });
  }
}
