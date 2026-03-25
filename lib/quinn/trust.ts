import { isTrustedSender } from "@/lib/quinn/allowlist";
import type { GmailMessage, MessagePart } from "@/lib/quinn/poller";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustCheckResult {
  trusted: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Header utilities
// ---------------------------------------------------------------------------

/**
 * Case-insensitive header lookup.
 * Returns the header value string, or undefined if not found.
 */
export function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string
): string | undefined {
  const lower = name.toLowerCase();
  return (
    headers.find((h) => (h.name ?? "").toLowerCase() === lower)?.value ??
    undefined
  );
}

/**
 * Extract the bare email address from an RFC 5322 From header value.
 * Handles both "Name <email>" and bare "email" formats.
 * Result is always lowercase.
 */
export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasDmarcPass(authResults: string | undefined): boolean {
  if (!authResults) return false;
  return authResults.toLowerCase().includes("dmarc=pass");
}

// ---------------------------------------------------------------------------
// Trust gate — runs all security checks in order
// ---------------------------------------------------------------------------

/**
 * Run all trust/security checks on a Gmail message in the required order:
 *
 *  1. INGEST-04 / D-11: labelIds must include "INBOX"       → "not-inbox"
 *  2. INGEST-06 / D-09: self-send guard                     → "self-send"
 *  3. INGEST-05 / D-10: Auto-Submitted header (value != "no") → "auto-submitted"
 *  4. INGEST-05 / D-10: X-Autoreply header present          → "x-autoreply"
 *  5. TRUST-02  / D-08: Authentication-Results dmarc=pass   → "dmarc-fail"
 *  6. TRUST-01  / D-05: From email in trusted allowlist     → "not-allowlisted"
 *
 * Returns { trusted: true } if all checks pass.
 * Never throws — all errors are caught and returned as { trusted: false }.
 */
export function checkTrust(message: GmailMessage): TrustCheckResult {
  try {
    const headers = message.payload?.headers ?? [];

    // 1. INGEST-04: must be in INBOX
    if (!message.labelIds?.includes("INBOX")) {
      return { trusted: false, reason: "not-inbox" };
    }

    // 2. INGEST-06 / D-09: self-send guard
    const fromHeader = getHeader(headers, "From") ?? "";
    const fromEmail = extractEmail(fromHeader);
    const quinnEmail = (process.env.GMAIL_USER ?? "").toLowerCase();
    if (fromEmail === quinnEmail) {
      return { trusted: false, reason: "self-send" };
    }

    // 3. INGEST-05 / D-10: Auto-Submitted header — discard unless value is "no"
    const autoSubmitted = getHeader(headers, "Auto-Submitted");
    if (autoSubmitted !== undefined && autoSubmitted.toLowerCase() !== "no") {
      return { trusted: false, reason: "auto-submitted" };
    }

    // 4. INGEST-05 / D-10: X-Autoreply header — presence alone is enough to discard
    const xAutoreply = getHeader(headers, "X-Autoreply");
    if (xAutoreply !== undefined) {
      return { trusted: false, reason: "x-autoreply" };
    }

    // 5. TRUST-02 / D-08: DMARC pass check
    const authResults = getHeader(headers, "Authentication-Results");
    if (!hasDmarcPass(authResults)) {
      return { trusted: false, reason: "dmarc-fail" };
    }

    // 6. TRUST-01 / D-05: sender must be in trusted allowlist
    if (!isTrustedSender(fromEmail)) {
      return { trusted: false, reason: "not-allowlisted" };
    }

    return { trusted: true };
  } catch {
    // TRUST-04: never throw — return structured result
    return { trusted: false, reason: "error" };
  }
}

// ---------------------------------------------------------------------------
// MIME body extraction — D-12
// ---------------------------------------------------------------------------

/**
 * Recursively search MIME part tree for a text/plain part.
 * Decodes base64url content (Gmail uses "-" and "_", not "+" and "/").
 * Returns null if no text/plain part is found.
 */
function extractPlainText(part: MessagePart): string | null {
  if (part.mimeType === "text/plain") {
    const data = part.body?.data;
    if (!data) return null;
    return Buffer.from(data, "base64url").toString("utf-8");
  }
  for (const child of part.parts ?? []) {
    const result = extractPlainText(child);
    if (result !== null) return result;
  }
  return null;
}

/**
 * Recursively search MIME part tree for a text/html part.
 * Decodes base64url content.
 * Returns null if no text/html part is found.
 */
function extractHtml(part: MessagePart): string | null {
  if (part.mimeType === "text/html") {
    const data = part.body?.data;
    if (!data) return null;
    return Buffer.from(data, "base64url").toString("utf-8");
  }
  for (const child of part.parts ?? []) {
    const result = extractHtml(child);
    if (result !== null) return result;
  }
  return null;
}

/**
 * Strip HTML tags from a string and decode common HTML entities.
 * Removes <style> and <script> blocks entirely (including their content).
 * Collapses resulting whitespace.
 */
export function stripHtml(html: string): string {
  // Remove <style>...</style> blocks entirely (including content)
  let text = html.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Remove <script>...</script> blocks entirely (including content)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]*>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Extract plain text body from a Gmail message payload (MIME part).
 *
 * Tries text/plain first. Falls back to text/html with tags stripped.
 * Returns "" if no readable body is found.
 *
 * Public API — consumed by Phase 2 intent parsing.
 */
export function extractBody(payload: MessagePart): string {
  const plain = extractPlainText(payload);
  if (plain !== null) return plain;

  const html = extractHtml(payload);
  if (html !== null) return stripHtml(html);

  return "";
}
