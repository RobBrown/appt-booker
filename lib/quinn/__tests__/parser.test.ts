import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Intent } from "@/lib/quinn/intent";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk before importing parser
// The Anthropic class is instantiated with `new`, so the mock must be
// a proper constructor function (class or function with prototype).
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: mockCreate,
      },
    };
  });
  return { default: MockAnthropic };
});

// Helper: build a mock tool_use response
function makeToolUseResponse(input: Record<string, unknown>) {
  return {
    content: [
      {
        type: "tool_use",
        name: "extract_intent",
        input,
      },
    ],
    usage: { input_tokens: 150, output_tokens: 80 },
    model: "claude-haiku-4-5-20251001",
  };
}

// Valid book intent input (matches Zod schema shape)
const validBookInput = {
  intent: "book",
  confidence: "high",
  rawDateText: "next Tuesday at 2pm",
  assumptions: [],
  requestedDate: "2026-03-31",
  duration: 30,
  timezone: "America/Toronto",
  attendeeNames: ["Alice"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseIntent()", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    // Reset the module to clear the singleton between tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls Anthropic messages.create with model 'claude-haiku-4-5-20251001'", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("Please book a meeting next Tuesday at 2pm");

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-5-20251001");
  });

  it("passes tool_choice forcing 'extract_intent'", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("Please book a meeting");

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tool_choice).toEqual({
      type: "tool",
      name: "extract_intent",
    });
  });

  it("includes current ISO date string in system prompt", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("book me a meeting");

    const callArgs = mockCreate.mock.calls[0][0];
    const systemPrompt: string = callArgs.system;

    // System prompt should include an ISO date string (YYYY-MM-DDTHH:MM...)
    expect(systemPrompt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("includes 'America/Toronto' in system prompt", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("book me a meeting");

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain("America/Toronto");
  });

  it("includes untrusted content security framing in system prompt", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("book me a meeting");

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain("untrusted external input");
  });

  it("returns Zod-validated intent on successful tool_use response", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    const result = await parseIntent(
      "Please book a meeting next Tuesday at 2pm"
    );

    expect(result.intent).toBe("book");
    expect(result.confidence).toBe("high");
  });

  it("retries once on Zod validation failure, then returns unknown fallback (D-21)", async () => {
    // Both attempts return invalid output (intent "invalid_intent")
    const badInput = { intent: "invalid_intent", confidence: "high" };
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse(badInput))
      .mockResolvedValueOnce(makeToolUseResponse(badInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    const result = await parseIntent("some email body");

    // Should have been called twice (initial + 1 retry)
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Should return unknown fallback
    expect(result.intent).toBe("unknown");
    expect(result.confidence).toBe("low");
    if (result.intent === "unknown") {
      expect(result.clarificationQuestion).toBeTruthy();
    }
  });

  it("throws on Anthropic API network error (D-22 — does NOT catch API errors)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Network error"));

    const { parseIntent } = await import("@/lib/quinn/parser");

    await expect(parseIntent("book a meeting")).rejects.toThrow("Network error");
  });

  it("logs model, token count, latency via console.log (D-23)", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("book a meeting");

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[quinn\/parser\]/)
    );
  });

  it("handles threadContext parameter (passed to user message when provided)", async () => {
    mockCreate.mockResolvedValueOnce(makeToolUseResponse(validBookInput));

    const { parseIntent } = await import("@/lib/quinn/parser");
    await parseIntent("book a meeting", "Previous thread context here");

    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[0].content;
    expect(userContent).toContain("Previous thread context here");
  });

  it("returns unknown fallback when tool_use block is missing after retry", async () => {
    // Response with no tool_use block (only text)
    const noToolUseResponse = {
      content: [{ type: "text", text: "Hello there" }],
      usage: { input_tokens: 50, output_tokens: 20 },
      model: "claude-haiku-4-5-20251001",
    };
    mockCreate
      .mockResolvedValueOnce(noToolUseResponse)
      .mockResolvedValueOnce(noToolUseResponse);

    const { parseIntent } = await import("@/lib/quinn/parser");
    const result = await parseIntent("some email");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.intent).toBe("unknown");
  });

  it("exports CLAUDE_MODEL constant with value 'claude-haiku-4-5-20251001'", async () => {
    const { CLAUDE_MODEL } = await import("@/lib/quinn/parser");
    expect(CLAUDE_MODEL).toBe("claude-haiku-4-5-20251001");
  });
});
