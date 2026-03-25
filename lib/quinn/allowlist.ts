/**
 * Trusted sender allowlist — loaded from QUINN_TRUSTED_SENDERS env var.
 * Comma-separated list of email addresses. If the env var is missing or
 * empty, no senders are trusted (fail-closed).
 */

let _senders: Set<string> | null = null;

function getTrustedSenders(): Set<string> {
  if (!_senders) {
    const raw = process.env.QUINN_TRUSTED_SENDERS ?? "";
    _senders = new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
  }
  return _senders;
}

/**
 * Returns true if the given email address is in the trusted sender allowlist.
 * Comparison is case-insensitive and trims surrounding whitespace.
 */
export function isTrustedSender(email: string): boolean {
  return getTrustedSenders().has(email.toLowerCase().trim());
}

/** Reset cached sender set — for testing only. */
export function _resetCache(): void {
  _senders = null;
}
