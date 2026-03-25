import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories must not reference outer variables (hoisting rule)
// ---------------------------------------------------------------------------

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => ({
      users: {
        messages: {
          send: vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    })),
  },
}));

vi.mock("@/lib/google-auth", () => ({
  getGoogleAuth: vi.fn(() => "mock-auth-client"),
}));

vi.mock("@/lib/gmail", () => ({
  sanitizeHeader: vi.fn((v: string) => v.replace(/[\r\n]/g, "")),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { sendReplyToThread } from "@/lib/quinn/mailer";
import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";

const QUINN_EMAIL = "quinn@example.com";

const BASE_OPTS = {
  threadId: "thread-123",
  inReplyTo: "<msg-id-001@mail.gmail.com>",
  references: "<msg-id-001@mail.gmail.com>",
  to: ["sender@example.com"],
  cc: [] as string[],
  subject: "Re: Tomorrow at 2pm?",
  bodyText: "All set — I've booked a 30-minute Zoom for 2:00 PM on Wednesday, March 25.\n\nQuinn",
};

describe("sendReplyToThread", () => {
  // Get a reference to the mocked send function via the mock factory
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GMAIL_USER = QUINN_EMAIL;

    // Re-establish the mock chain each time so we can capture calls
    mockSend = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(google.gmail).mockReturnValue({
      users: { messages: { send: mockSend } },
    } as ReturnType<typeof google.gmail>);
  });

  it("calls gmail.users.messages.send", async () => {
    await sendReplyToThread(BASE_OPTS);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("passes threadId in requestBody", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      userId: string;
      requestBody: { raw: string; threadId: string };
    };
    expect(call.requestBody.threadId).toBe("thread-123");
  });

  it("sends to userId 'me'", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as { userId: string };
    expect(call.userId).toBe("me");
  });

  it("raw MIME is base64url encoded (no +, /, or = chars)", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    expect(call.requestBody.raw).not.toMatch(/[+/=]/);
  });

  it("decoded MIME contains In-Reply-To header", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("In-Reply-To: <msg-id-001@mail.gmail.com>");
  });

  it("decoded MIME contains References header", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("References: <msg-id-001@mail.gmail.com>");
  });

  it("decoded MIME contains Auto-Submitted: auto-generated header", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("Auto-Submitted: auto-generated");
  });

  it("From header is \"Quinn\" <GMAIL_USER>", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain(`From: "Quinn" <${QUINN_EMAIL}>`);
  });

  it("uses getGoogleAuth() for gmail auth", async () => {
    await sendReplyToThread(BASE_OPTS);
    expect(getGoogleAuth).toHaveBeenCalled();
    expect(google.gmail).toHaveBeenCalledWith(
      expect.objectContaining({ auth: "mock-auth-client" })
    );
  });

  it("excludes Quinn's email from To recipients", async () => {
    const optsWithQuinn = {
      ...BASE_OPTS,
      to: ["sender@example.com", QUINN_EMAIL],
    };
    await sendReplyToThread(optsWithQuinn);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("sender@example.com");
    const toLine = decoded.split("\n").find((l) => l.startsWith("To:"));
    expect(toLine).toBeDefined();
    expect(toLine).not.toContain(QUINN_EMAIL);
  });

  it("excludes Quinn's email from CC recipients", async () => {
    const optsWithQuinnCC = {
      ...BASE_OPTS,
      cc: [QUINN_EMAIL, "other@example.com"],
    };
    await sendReplyToThread(optsWithQuinnCC);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    const ccLine = decoded.split("\n").find((l) => l.startsWith("CC:"));
    if (ccLine) {
      expect(ccLine).not.toContain(QUINN_EMAIL);
    }
  });

  it("omits CC header when CC list is empty after filtering", async () => {
    const optsEmptyCC = {
      ...BASE_OPTS,
      cc: [QUINN_EMAIL],
    };
    await sendReplyToThread(optsEmptyCC);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).not.toMatch(/^CC:/m);
  });

  it("decoded MIME contains Content-Type: text/plain", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("Content-Type: text/plain");
  });

  it("body text appears in MIME", async () => {
    await sendReplyToThread(BASE_OPTS);
    const call = mockSend.mock.calls[0][0] as {
      requestBody: { raw: string };
    };
    const decoded = Buffer.from(call.requestBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("All set");
    expect(decoded).toContain("Quinn");
  });
});
