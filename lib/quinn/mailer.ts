/**
 * Quinn Gmail threading sender — D-23, D-24, D-25
 *
 * Builds a MIME reply with threading headers and sends it via the Gmail
 * API in-thread.  Supports plain-text, HTML (multipart/alternative),
 * and .ics calendar attachments (multipart/mixed).
 *
 * Key requirements:
 *   - In-Reply-To + References headers for Gmail threading (D-23)
 *   - Auto-Submitted: auto-generated to prevent reply loops (D-24)
 *   - quinn@example.com excluded from all recipient lists (D-25)
 */

import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";
import { sanitizeHeader } from "@/lib/gmail";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendReplyOpts {
  threadId: string;
  inReplyTo: string;
  references: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  icsContent?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getQuinnEmail(): string {
  return (process.env.GMAIL_USER ?? "quinn@example.com").toLowerCase();
}

function excludeQuinn(addresses: string[]): string[] {
  const quinn = getQuinnEmail();
  return addresses.filter(
    (addr) => !addr.toLowerCase().includes(quinn)
  );
}

function buildMime(opts: SendReplyOpts): string {
  const gmailUser = process.env.GMAIL_USER ?? "quinn@example.com";
  const toFiltered = excludeQuinn(opts.to);
  const ccFiltered = excludeQuinn(opts.cc);

  const headers: string[] = [
    `From: "Quinn" <${sanitizeHeader(gmailUser)}>`,
    `To: ${toFiltered.map((r) => sanitizeHeader(r)).join(", ")}`,
  ];

  if (ccFiltered.length > 0) {
    headers.push(`CC: ${ccFiltered.map((r) => sanitizeHeader(r)).join(", ")}`);
  }

  headers.push(
    `Subject: ${sanitizeHeader(opts.subject)}`,
    `In-Reply-To: ${sanitizeHeader(opts.inReplyTo)}`,
    `References: ${sanitizeHeader(opts.references)}`,
    `Auto-Submitted: auto-generated`,
    `MIME-Version: 1.0`,
  );

  const hasHtml = !!opts.bodyHtml;
  const hasIcs = !!opts.icsContent;

  // Plain text only — no HTML, no attachment
  if (!hasHtml && !hasIcs) {
    headers.push(
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      opts.bodyText,
    );
    return headers.join("\r\n");
  }

  // Build the text/html body part (multipart/alternative when HTML present)
  const altBoundary = `quinn_alt_${Date.now().toString(36)}`;
  let bodyPart: string;
  if (hasHtml) {
    bodyPart = [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      ``,
      `--${altBoundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      opts.bodyText,
      `--${altBoundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      opts.bodyHtml!,
      `--${altBoundary}--`,
    ].join("\r\n");
  } else {
    bodyPart = [
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      opts.bodyText,
    ].join("\r\n");
  }

  // No ICS — just the body
  if (!hasIcs) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`, ``);
    headers.push(
      `--${altBoundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      opts.bodyText,
      `--${altBoundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      opts.bodyHtml!,
      `--${altBoundary}--`,
    );
    return headers.join("\r\n");
  }

  // Has ICS (and possibly HTML) — wrap in multipart/mixed
  const mixedBoundary = `quinn_mix_${Date.now().toString(36)}`;
  headers.push(
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    bodyPart,
    `--${mixedBoundary}`,
    `Content-Type: text/calendar; charset=UTF-8; method=REQUEST`,
    `Content-Disposition: attachment; filename="invite.ics"`,
    ``,
    opts.icsContent!,
    `--${mixedBoundary}--`,
  );

  return headers.join("\r\n");
}

// ---------------------------------------------------------------------------
// Main export — D-23, D-24, D-25
// ---------------------------------------------------------------------------

/**
 * Send a reply in the same Gmail thread as the original message.
 *
 * @param opts - Threading + recipient + content options
 */
export async function sendReplyToThread(opts: SendReplyOpts): Promise<void> {
  const mime = buildMime(opts);
  const raw = Buffer.from(mime).toString("base64url");

  const gmail = google.gmail({ version: "v1", auth: getGoogleAuth() });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: opts.threadId,
    },
  });
}
