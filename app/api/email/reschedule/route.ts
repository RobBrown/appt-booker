import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  sendEmail,
  buildIcs,
  escapeHtml,
  formatDate,
  formatTime,
  formatLocationLine,
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
      oldStartTime,
      newStartTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      token,
    } = body;

    if (
      !bookerName ||
      !bookerEmail ||
      !oldStartTime ||
      !newStartTime ||
      !duration ||
      !timezone ||
      !locationType ||
      !token
    ) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const oldStart = new Date(oldStartTime);
    const newStart = new Date(newStartTime);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostDomain = process.env.HOST_DOMAIN ?? "";
    const locationLine = formatLocationLine(locationType, locationDetails);
    const oldDateStr = formatDate(oldStart, timezone);
    const oldTimeStr = formatTime(oldStart, timezone);
    const newDateStr = formatDate(newStart, timezone);
    const newTimeStr = formatTime(newStart, timezone);
    const manageUrl = `${hostDomain}/manage/${token}`;

    const summaryOpts = {
      bookerName,
      startTime: newStart,
      duration,
      timezone,
      locationType,
      locationDetails,
    };

    // -------------------------------------------------------------------------
    // ICS for booker (same UID = same token, so calendar apps update the event)
    // -------------------------------------------------------------------------
    const icsContent = buildIcs({
      uid: token,
      startTime: newStart,
      duration,
      summary: `Meeting with ${hostName}`,
      description: `Meeting with ${hostName}\nDate: ${newDateStr}`,
      location: locationLine,
      organizerEmail: process.env.GMAIL_USER!,
      attendeeEmail: bookerEmail,
      attendeeName: bookerName,
    });

    // -------------------------------------------------------------------------
    // Email to booker
    // -------------------------------------------------------------------------
    const bookerText = [
      `Hi ${bookerName},`,
      ``,
      `Your meeting with ${hostName} has been rescheduled.`,
      ``,
      formatSummaryText(summaryOpts),
      ``,
      `If you need to make another change:`,
      manageUrl,
    ].join("\n");

    const bookerHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827">You're rescheduled with ${hostName}</h1>
    <p style="margin:0 0 28px;color:#6B7280">Here are the updated details.</p>

    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(summaryOpts)}
    </div>

    <div style="margin:32px 0;border-top:1px solid #E5E7EB"></div>
    <p style="margin:0 0 12px;color:#6B7280;font-size:14px">Need to make another change?</p>
    <a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">Cancel or reschedule</a>
  </div>
</body>
</html>`;

    await sendEmail({
      to: bookerEmail,
      subject: `Your meeting with ${hostName} has been rescheduled — ${newDateStr} at ${newTimeStr}`,
      text: bookerText,
      html: bookerHtml,
      icsContent,
    });

    // -------------------------------------------------------------------------
    // Email to host
    // -------------------------------------------------------------------------
    const hostText = [
      `Rescheduled: ${bookerName}`,
      ``,
      formatSummaryText(summaryOpts),
      ``,
      `Booker email: ${bookerEmail}`,
      `Previously: ${oldDateStr} at ${oldTimeStr}`,
    ].join("\n");

    const hostHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#111827">Rescheduled: ${escapeHtml(bookerName)}</h1>

    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(summaryOpts)}
    </div>

    <p style="margin:16px 0 0;color:#6B7280;font-size:13px">Booker email: <a href="mailto:${escapeHtml(bookerEmail)}" style="color:#2563EB">${escapeHtml(bookerEmail)}</a></p>
    <p style="margin:8px 0 0;color:#6B7280;font-size:13px">Previously: ${oldDateStr} at ${oldTimeStr}</p>
  </div>
</body>
</html>`;

    await sendEmail({
      to: process.env.GMAIL_USER!,
      subject: `Rescheduled: ${bookerName} — now ${newDateStr} at ${newTimeStr}`,
      text: hostText,
      html: hostHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Failed to send reschedule emails." }, { status: 500 });
  }
}
