import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { pollInbox } from "@/lib/quinn/poller";
import {
  incrementConsecutiveFailures,
  resetConsecutiveFailures,
} from "@/lib/quinn/dedup";
import { sendEmail } from "@/lib/gmail";
import { checkTrust, getHeader, extractEmail } from "@/lib/quinn/trust";
import { processMessage } from "@/lib/quinn/processor";
import { composeReply } from "@/lib/quinn/responder";
import { sendReplyToThread } from "@/lib/quinn/mailer";
import { getPostHogClient } from "@/lib/posthog-server";

// ---------------------------------------------------------------------------
// POST /api/cron/quinn-poll
//
// Cron endpoint — Render schedule: */5 * * * * (D-04)
// Auth: CRON_SECRET via Authorization: Bearer header (D-04)
// Always returns 200 — never throws (D-07)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Observability helper — D-28
// Wraps PostHog capture in try/catch so observability never crashes the pipeline
// ---------------------------------------------------------------------------

function logQuinnEvent(
  event: string,
  properties: Record<string, unknown>
): void {
  try {
    getPostHogClient().capture({ distinctId: "quinn-system", event, properties });
  } catch {
    // Intentionally silenced — observability must never crash the pipeline
  }
}

export async function POST(request: NextRequest) {
  // -------------------------------------------------------------------------
  // Auth — mirrors app/api/cron/reminders/route.ts exactly (D-04 / HEALTH-03)
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Poll — always return 200 regardless of errors (D-07)
  // -------------------------------------------------------------------------

  try {
    const messages = await pollInbox();
    await resetConsecutiveFailures();
    console.log(`[quinn/poll] Processed ${messages.length} message(s)`);

    let trusted = 0;
    let discarded = 0;
    let replied = 0;

    for (const msg of messages) {
      const trustResult = checkTrust(msg);
      if (!trustResult.trusted) {
        // TRUST-04: silently discard — no reply, no error
        console.log(`[quinn/poll] Discarded ${msg.id} reason=${trustResult.reason}`);
        logQuinnEvent("quinn:trust_check", {
          message_id: msg.id,
          result: trustResult.reason,
        });
        discarded++;
        continue;
      }

      // Log received + trusted
      logQuinnEvent("quinn:email_received", {
        message_id: msg.id,
        thread_id: msg.threadId,
      });
      logQuinnEvent("quinn:trust_check", {
        message_id: msg.id,
        result: "trusted",
      });

      console.log(`[quinn/poll] Trusted message ${msg.id} thread=${msg.threadId}`);
      trusted++;

      // D-28: individual message errors do not kill the batch
      try {
        const result = await processMessage(msg);

        // Internal errors: log to Sentry, don't reply to the sender
        if (result.actionResult.type === "error") {
          Sentry.captureMessage(`Quinn error for message ${msg.id}: ${result.actionResult.userMessage}`, "warning");
          console.log(
            `[quinn/poll] Suppressed error reply for ${msg.id}: ${result.actionResult.userMessage}`
          );
          continue;
        }

        // Compose reply
        const intentTimezone =
          "timezone" in result.intent ? (result.intent.timezone ?? null) : null;
        const reply = composeReply(result.intent, result.actionResult, {
          timezone: intentTimezone ?? "America/Toronto",
        });

        // Extract threading headers from original message
        const messageId = getHeader(msg.payload.headers, "Message-ID") ?? "";
        const subject = getHeader(msg.payload.headers, "Subject") ?? "";
        const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

        // Build recipient list: original sender + all To/CC, excluding Quinn
        const toHeader = getHeader(msg.payload.headers, "To") ?? "";
        const ccHeader =
          getHeader(msg.payload.headers, "Cc") ??
          getHeader(msg.payload.headers, "CC") ??
          "";
        const fromHeader = getHeader(msg.payload.headers, "From") ?? "";

        const allRecipients = [
          fromHeader,
          ...toHeader.split(","),
          ...ccHeader.split(","),
        ]
          .map((r) => r.trim())
          .filter(Boolean)
          .filter((r) => !extractEmail(r).includes((process.env.GMAIL_USER ?? "").toLowerCase()));

        // Extract .ics content for Quinn booking replies
        const icsContent =
          result.actionResult.type === "booked"
            ? result.actionResult.bookingDetails?.icsContent
            : undefined;

        // Send reply in-thread (with HTML + .ics attachment when booking)
        await sendReplyToThread({
          threadId: msg.threadId,
          inReplyTo: messageId,
          references: messageId,
          to: allRecipients,
          cc: [],
          subject: replySubject,
          bodyText: reply.text,
          ...(reply.html ? { bodyHtml: reply.html } : {}),
          ...(icsContent ? { icsContent } : {}),
        });

        replied++;

        // PostHog: reply sent (D-28)
        logQuinnEvent("quinn:reply_sent", {
          message_id: msg.id,
          intent_type: result.intent.intent,
          success: result.success,
          duration_ms: result.durationMs,
        });

        console.log(
          `[quinn/poll] Replied to message ${msg.id} intent=${result.intent.intent} success=${result.success}`
        );
      } catch (msgErr) {
        Sentry.captureException(msgErr);
        console.log(
          `[quinn/poll] Error processing message ${msg.id}: ${
            msgErr instanceof Error ? msgErr.message : String(msgErr)
          }`
        );
      }
    }

    console.log(
      `[quinn/poll] Done: ${trusted} trusted, ${discarded} discarded, ${replied} replied`
    );
    return NextResponse.json({
      ok: true,
      processed: messages.length,
      trusted,
      discarded,
      replied,
    });
  } catch (error) {
    console.error(`[quinn/poll] POLL ERROR:`, error);
    Sentry.captureException(error);

    // Track consecutive failures (D-06)
    const failures = await incrementConsecutiveFailures();

    // Alert Rob after 3 consecutive failures (D-06)
    if (failures >= 3) {
      try {
        await sendEmail({
          to: process.env.GMAIL_USER!,
          subject: "Quinn: polling error",
          text: [
            "Quinn has failed to poll Gmail 3 times in a row.",
            "",
            `Last error: ${error instanceof Error ? error.message : String(error)}`,
            "",
            "Check Sentry for the full stack trace. Quinn will automatically",
            "resume on the next successful poll.",
          ].join("\n"),
          html: "",
        });
      } catch (emailErr) {
        Sentry.captureException(emailErr);
      }
    }

    // D-07: Always return 200 to prevent Render from disabling the cron
    return NextResponse.json({ ok: true, error: "Poll failed, see Sentry" });
  }
}
