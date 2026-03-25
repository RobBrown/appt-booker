import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkTrust,
  extractBody,
  getHeader,
  extractEmail,
  TrustCheckResult,
} from "@/lib/quinn/trust";
import { _resetCache } from "@/lib/quinn/allowlist";
import type { GmailMessage, MessagePart } from "@/lib/quinn/poller";

// ---------------------------------------------------------------------------
// Helpers — build mock GmailMessage objects
// ---------------------------------------------------------------------------

const SENDER_EMAIL = "sender@example.com";
const QUINN_SERVICE_EMAIL = "quinn@example.com";

type HeaderMap = Record<string, string>;

function makeMessage(overrides: {
  labelIds?: string[];
  headers?: HeaderMap;
  mimeType?: string;
  bodyData?: string;
  parts?: MessagePart[];
}): GmailMessage {
  const {
    labelIds = ["INBOX"],
    headers = {},
    mimeType = "text/plain",
    bodyData,
    parts,
  } = overrides;

  const defaultHeaders: HeaderMap = {
    From: `Sender <${SENDER_EMAIL}>`,
    "Authentication-Results": "mx.google.com; dmarc=pass header.from=example.com",
    ...headers,
  };

  return {
    id: "msg-001",
    threadId: "thread-001",
    labelIds,
    payload: {
      headers: Object.entries(defaultHeaders).map(([name, value]) => ({
        name,
        value,
      })),
      mimeType,
      body: bodyData !== undefined ? { data: bodyData } : null,
      parts: parts ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Setup: stub env vars for allowlist and self-send guard
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("QUINN_TRUSTED_SENDERS", SENDER_EMAIL);
  vi.stubEnv("GMAIL_USER", QUINN_SERVICE_EMAIL);
  _resetCache();
});

// ---------------------------------------------------------------------------
// getHeader
// ---------------------------------------------------------------------------

describe("getHeader", () => {
  const headers = [
    { name: "From", value: `Sender <${SENDER_EMAIL}>` },
    { name: "Subject", value: "Hello" },
  ];

  it("finds a header by exact name", () => {
    expect(getHeader(headers, "From")).toBe(`Sender <${SENDER_EMAIL}>`);
  });

  it("finds a header case-insensitively", () => {
    expect(getHeader(headers, "from")).toBe(`Sender <${SENDER_EMAIL}>`);
    expect(getHeader(headers, "FROM")).toBe(`Sender <${SENDER_EMAIL}>`);
    expect(getHeader(headers, "SUBJECT")).toBe("Hello");
  });

  it("returns undefined for a missing header", () => {
    expect(getHeader(headers, "X-Missing")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractEmail
// ---------------------------------------------------------------------------

describe("extractEmail", () => {
  it("extracts email from 'Name <email>' format", () => {
    expect(extractEmail(`Sender <${SENDER_EMAIL}>`)).toBe(SENDER_EMAIL);
  });

  it("handles bare email address", () => {
    expect(extractEmail(SENDER_EMAIL)).toBe(SENDER_EMAIL);
  });

  it("lowercases the result", () => {
    expect(extractEmail("SENDER@EXAMPLE.COM")).toBe(SENDER_EMAIL);
    expect(extractEmail("Sender <SENDER@EXAMPLE.COM>")).toBe(SENDER_EMAIL);
  });
});

// ---------------------------------------------------------------------------
// checkTrust
// ---------------------------------------------------------------------------

describe("checkTrust", () => {
  it("returns {trusted: false, reason: 'not-inbox'} when INBOX label is absent", () => {
    const msg = makeMessage({ labelIds: ["SENT"] });
    expect(checkTrust(msg)).toEqual({ trusted: false, reason: "not-inbox" });
  });

  it("returns {trusted: false, reason: 'self-send'} when From is Quinn's service email", () => {
    const msg = makeMessage({
      headers: {
        From: `Quinn <${QUINN_SERVICE_EMAIL}>`,
        "Authentication-Results":
          "mx.google.com; dmarc=pass header.from=example.com",
      },
    });
    expect(checkTrust(msg)).toEqual({ trusted: false, reason: "self-send" });
  });

  it("returns {trusted: false, reason: 'auto-submitted'} when Auto-Submitted is 'auto-replied'", () => {
    const msg = makeMessage({
      headers: {
        From: `Sender <${SENDER_EMAIL}>`,
        "Authentication-Results":
          "mx.google.com; dmarc=pass header.from=example.com",
        "Auto-Submitted": "auto-replied",
      },
    });
    expect(checkTrust(msg)).toEqual({
      trusted: false,
      reason: "auto-submitted",
    });
  });

  it("returns {trusted: true} when Auto-Submitted is 'no' (RFC 3834: human-sent)", () => {
    const msg = makeMessage({
      headers: {
        From: `Sender <${SENDER_EMAIL}>`,
        "Authentication-Results":
          "mx.google.com; dmarc=pass header.from=example.com",
        "Auto-Submitted": "no",
      },
    });
    expect(checkTrust(msg)).toEqual({ trusted: true });
  });

  it("returns {trusted: true} when Auto-Submitted header is absent", () => {
    const msg = makeMessage({});
    expect(checkTrust(msg)).toEqual({ trusted: true });
  });

  it("returns {trusted: false, reason: 'x-autoreply'} when X-Autoreply header exists", () => {
    const msg = makeMessage({
      headers: {
        From: `Sender <${SENDER_EMAIL}>`,
        "Authentication-Results":
          "mx.google.com; dmarc=pass header.from=example.com",
        "X-Autoreply": "yes",
      },
    });
    expect(checkTrust(msg)).toEqual({ trusted: false, reason: "x-autoreply" });
  });

  it("returns {trusted: false, reason: 'dmarc-fail'} when Authentication-Results has no dmarc=pass", () => {
    const msg = makeMessage({
      headers: {
        From: `Sender <${SENDER_EMAIL}>`,
        "Authentication-Results": "mx.google.com; dmarc=fail header.from=example.com",
      },
    });
    expect(checkTrust(msg)).toEqual({ trusted: false, reason: "dmarc-fail" });
  });

  it("returns {trusted: false, reason: 'dmarc-fail'} when Authentication-Results header is missing", () => {
    const msg: GmailMessage = {
      id: "msg-001",
      threadId: "thread-001",
      labelIds: ["INBOX"],
      payload: {
        headers: [{ name: "From", value: `Sender <${SENDER_EMAIL}>` }],
        mimeType: "text/plain",
        body: null,
        parts: null,
      },
    };
    expect(checkTrust(msg)).toEqual({ trusted: false, reason: "dmarc-fail" });
  });

  it("returns {trusted: false, reason: 'not-allowlisted'} when From is not in allowlist", () => {
    const msg = makeMessage({
      headers: {
        From: "Stranger <stranger@example.com>",
        "Authentication-Results":
          "mx.google.com; dmarc=pass header.from=example.com",
      },
    });
    expect(checkTrust(msg)).toEqual({
      trusted: false,
      reason: "not-allowlisted",
    });
  });

  it("returns {trusted: true} for a fully valid message from an allowlisted sender with dmarc=pass", () => {
    const msg = makeMessage({});
    expect(checkTrust(msg)).toEqual({ trusted: true });
  });

  it("never throws — returns TrustCheckResult even on malformed input", () => {
    const badMsg = {
      id: "x",
      threadId: "t",
      labelIds: [],
      payload: { headers: [] },
    } as unknown as GmailMessage;

    let result: TrustCheckResult | undefined;
    expect(() => {
      result = checkTrust(badMsg);
    }).not.toThrow();
    expect(result).toBeDefined();
    expect(typeof result!.trusted).toBe("boolean");
  });

  it("checks are ordered: not-inbox fires before self-send", () => {
    const msg = makeMessage({
      labelIds: ["SENT"],
      headers: {
        From: `Quinn <${QUINN_SERVICE_EMAIL}>`,
        "Authentication-Results":
          "mx.google.com; dmarc=pass header.from=example.com",
      },
    });
    expect(checkTrust(msg)).toEqual({ trusted: false, reason: "not-inbox" });
  });
});

// ---------------------------------------------------------------------------
// extractBody
// ---------------------------------------------------------------------------

// Helper: base64url-encode a UTF-8 string (uses "-" and "_" not "+" and "/")
function b64url(text: string): string {
  return Buffer.from(text, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("extractBody", () => {
  it("returns plain text for a simple text/plain message", () => {
    const payload: MessagePart = {
      mimeType: "text/plain",
      body: { data: b64url("Hello, world!") },
      parts: null,
    };
    expect(extractBody(payload)).toBe("Hello, world!");
  });

  it("decodes base64url correctly (uses '-' and '_')", () => {
    const payload: MessagePart = {
      mimeType: "text/plain",
      body: { data: b64url("Hello") },
      parts: null,
    };
    expect(extractBody(payload)).toBe("Hello");
  });

  it("returns stripped text for HTML-only message", () => {
    const html = "<p>Hello <b>world</b>!</p>";
    const payload: MessagePart = {
      mimeType: "text/html",
      body: { data: b64url(html) },
      parts: null,
    };
    const result = extractBody(payload);
    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<b>");
  });

  it("strips style and script tags entirely (not just the tags)", () => {
    const html =
      "<html><head><style>body{color:red}</style><script>alert(1)</script></head><body>Real content</body></html>";
    const payload: MessagePart = {
      mimeType: "text/html",
      body: { data: b64url(html) },
      parts: null,
    };
    const result = extractBody(payload);
    expect(result).toContain("Real content");
    expect(result).not.toContain("body{color:red}");
    expect(result).not.toContain("alert(1)");
  });

  it("decodes HTML entities: &amp; &lt; &gt; &quot; &#39; &nbsp;", () => {
    const html = "<p>Tom &amp; Jerry &lt;hello&gt; &quot;hi&quot; &#39;yo&#39;&nbsp;!</p>";
    const payload: MessagePart = {
      mimeType: "text/html",
      body: { data: b64url(html) },
      parts: null,
    };
    const result = extractBody(payload);
    expect(result).toContain("Tom & Jerry");
    expect(result).toContain("<hello>");
    expect(result).toContain('"hi"');
    expect(result).toContain("'yo'");
  });

  it("returns text/plain part for multipart/alternative (prefers plain over html)", () => {
    const payload: MessagePart = {
      mimeType: "multipart/alternative",
      body: null,
      parts: [
        {
          mimeType: "text/plain",
          body: { data: b64url("Plain text version") },
          parts: null,
        },
        {
          mimeType: "text/html",
          body: { data: b64url("<p>HTML version</p>") },
          parts: null,
        },
      ],
    };
    expect(extractBody(payload)).toBe("Plain text version");
  });

  it("falls back to HTML when no text/plain is present", () => {
    const payload: MessagePart = {
      mimeType: "multipart/alternative",
      body: null,
      parts: [
        {
          mimeType: "text/html",
          body: { data: b64url("<p>HTML only</p>") },
          parts: null,
        },
      ],
    };
    const result = extractBody(payload);
    expect(result).toContain("HTML only");
    expect(result).not.toContain("<p>");
  });

  it("returns empty string for message with no body", () => {
    const payload: MessagePart = {
      mimeType: "text/plain",
      body: null,
      parts: null,
    };
    expect(extractBody(payload)).toBe("");
  });

  it("returns empty string when body.data is null", () => {
    const payload: MessagePart = {
      mimeType: "text/plain",
      body: { data: null },
      parts: null,
    };
    expect(extractBody(payload)).toBe("");
  });
});
