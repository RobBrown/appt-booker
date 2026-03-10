import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  sendEmail,
  buildIcs,
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
      bookerPhone = "",
      startTime,
      duration,
      timezone,
      locationType,
      locationDetails = "",
      additionalAttendees = [],
      description = "",
      token,
    } = body;

    if (!bookerName || !bookerEmail || !startTime || !duration || !timezone || !locationType || !token) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const start = new Date(startTime);
    const hostName = process.env.HOST_NAME ?? "Your host";
    const hostDomain = process.env.HOST_DOMAIN ?? "";

    const manageUrl = `${hostDomain}/manage/${token}`;
    const dateStr = formatDate(start, timezone);
    const startTimeStr = formatTime(start, timezone);
    const locationLine = formatLocationLine(locationType, locationDetails);

    const summaryOpts = {
      bookerName,
      additionalAttendees,
      description,
      startTime: start,
      duration,
      timezone,
      locationType,
      locationDetails,
      bookerPhone,
    };

    // ---------------------------------------------------------------------------
    // Plain text
    // ---------------------------------------------------------------------------
    const text = [
      `Hi ${bookerName},`,
      ``,
      `You're all set. Here are the details for your meeting with ${hostName}.`,
      ``,
      formatSummaryText(summaryOpts),
      ``,
      `If anything comes up, you can cancel or reschedule here:`,
      manageUrl,
    ].join("\n");

    // ---------------------------------------------------------------------------
    // HTML
    // ---------------------------------------------------------------------------
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:-apple-system,Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#FFFFFF;border-radius:12px;padding:40px;border:1px solid #E5E7EB">
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827">You're booked with ${hostName}</h1>
    <p style="margin:0 0 28px;color:#6B7280">Here are your meeting details.</p>

    <div style="background:#F9FAFB;border-radius:8px;padding:20px 24px;margin-bottom:24px">
      ${formatSummaryHtml(summaryOpts)}
    </div>

    <div style="margin:32px 0;border-top:1px solid #E5E7EB"></div>

    <p style="margin:0 0 12px;color:#6B7280;font-size:14px">Need to change your plans?</p>
    <a href="${manageUrl}" style="display:inline-block;padding:10px 20px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">Cancel or reschedule</a>

  </div>
</body>
</html>`;

    // ---------------------------------------------------------------------------
    // ICS
    // ---------------------------------------------------------------------------
    const allAttendees: Array<{ name: string; email?: string }> = [
      { name: bookerName, email: bookerEmail },
      ...additionalAttendees,
    ];
    const hasExtra = additionalAttendees.length > 0;
    const icsDescription = [
      `Meeting with ${hostName}`,
      `Date: ${dateStr}`,
      description ? `\nPurpose: ${description}` : "",
      hasExtra ? `\nAttendees:\n${allAttendees.map((a) => `${a.name}${a.email ? ` <${a.email}>` : ""}`).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const icsContent = buildIcs({
      uid: token,
      startTime: start,
      duration,
      summary: `Meeting with ${hostName}`,
      description: icsDescription,
      location: locationLine,
      organizerEmail: process.env.GMAIL_USER!,
      attendeeEmail: bookerEmail,
      attendeeName: bookerName,
    });

    // ---------------------------------------------------------------------------
    // Send
    // ---------------------------------------------------------------------------
    await sendEmail({
      to: bookerEmail,
      subject: `You're booked with ${hostName} — ${dateStr} at ${startTimeStr}`,
      text,
      html,
      icsContent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Failed to send confirmation email." },
      { status: 500 }
    );
  }
}
