import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock functions — must be created before vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockGetHistoryId,
  mockSetHistoryId,
  mockIsProcessed,
  mockMarkProcessed,
  mockResetConsecutiveFailures,
  mockGetProfile,
  mockHistoryList,
  mockMessagesGet,
} = vi.hoisted(() => ({
  mockGetHistoryId: vi.fn(),
  mockSetHistoryId: vi.fn(),
  mockIsProcessed: vi.fn(),
  mockMarkProcessed: vi.fn(),
  mockResetConsecutiveFailures: vi.fn(),
  mockGetProfile: vi.fn(),
  mockHistoryList: vi.fn(),
  mockMessagesGet: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/quinn/dedup", () => ({
  getHistoryId: mockGetHistoryId,
  setHistoryId: mockSetHistoryId,
  isProcessed: mockIsProcessed,
  markProcessed: mockMarkProcessed,
  resetConsecutiveFailures: mockResetConsecutiveFailures,
}));

vi.mock("@/lib/google-auth", () => ({
  getGoogleAuth: vi.fn().mockReturnValue({}),
}));

vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn().mockReturnValue({
      users: {
        getProfile: mockGetProfile,
        history: {
          list: mockHistoryList,
        },
        messages: {
          get: mockMessagesGet,
        },
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { pollInbox } from "@/lib/quinn/poller";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(id: string, labelIds: string[] = ["INBOX"]) {
  return {
    data: {
      id,
      threadId: `thread-${id}`,
      labelIds,
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "Subject", value: "Test" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from("Hello").toString("base64url") },
        parts: null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetHistoryId.mockReset();
  mockSetHistoryId.mockReset();
  mockIsProcessed.mockReset();
  mockMarkProcessed.mockReset();
  mockResetConsecutiveFailures.mockReset();
  mockGetProfile.mockReset();
  mockHistoryList.mockReset();
  mockMessagesGet.mockReset();

  // Default: not processed
  mockIsProcessed.mockResolvedValue(false);
  mockSetHistoryId.mockResolvedValue(undefined);
  mockMarkProcessed.mockResolvedValue(undefined);
  mockResetConsecutiveFailures.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Test: Bootstrap (first run — no historyId)
// ---------------------------------------------------------------------------

describe("pollInbox — bootstrap (first run)", () => {
  it("calls getProfile when historyId is null, stores it, and returns empty array", async () => {
    mockGetHistoryId.mockResolvedValueOnce(null);
    mockGetProfile.mockResolvedValueOnce({ data: { historyId: "111222" } });

    const result = await pollInbox();

    expect(mockGetProfile).toHaveBeenCalledWith({ userId: "me" });
    expect(mockSetHistoryId).toHaveBeenCalledWith("111222");
    expect(mockHistoryList).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test: Normal poll with new messages
// ---------------------------------------------------------------------------

describe("pollInbox — normal poll with messages", () => {
  it("fetches new messages from history.list, deduplicates, and returns them", async () => {
    mockGetHistoryId.mockResolvedValueOnce("100000");
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [
          { messagesAdded: [{ message: { id: "msg1" } }] },
          { messagesAdded: [{ message: { id: "msg2" } }] },
        ],
        historyId: "100010",
        nextPageToken: undefined,
      },
    });
    mockIsProcessed.mockResolvedValue(false);
    mockMessagesGet.mockResolvedValueOnce(makeMessage("msg1"));
    mockMessagesGet.mockResolvedValueOnce(makeMessage("msg2"));

    const result = await pollInbox();

    expect(mockHistoryList).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "me",
        startHistoryId: "100000",
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
      })
    );
    expect(mockSetHistoryId).toHaveBeenCalledWith("100010");
    expect(mockMarkProcessed).toHaveBeenCalledWith("msg1");
    expect(mockMarkProcessed).toHaveBeenCalledWith("msg2");
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Test: Empty poll (no new messages, cursor still updated)
// ---------------------------------------------------------------------------

describe("pollInbox — empty poll", () => {
  it("updates cursor even when no new messages", async () => {
    mockGetHistoryId.mockResolvedValueOnce("200000");
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [],
        historyId: "200005",
        nextPageToken: undefined,
      },
    });

    const result = await pollInbox();

    expect(mockSetHistoryId).toHaveBeenCalledWith("200005");
    expect(result).toEqual([]);
  });

  it("handles undefined history array (Gmail returns no history key)", async () => {
    mockGetHistoryId.mockResolvedValueOnce("300000");
    mockHistoryList.mockResolvedValueOnce({
      data: {
        historyId: "300005",
        nextPageToken: undefined,
      },
    });

    const result = await pollInbox();

    expect(mockSetHistoryId).toHaveBeenCalledWith("300005");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test: Deduplication
// ---------------------------------------------------------------------------

describe("pollInbox — deduplication", () => {
  it("skips messages that isProcessed() returns true for", async () => {
    mockGetHistoryId.mockResolvedValueOnce("400000");
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id: "dup-msg" } }] }],
        historyId: "400001",
      },
    });
    mockIsProcessed.mockResolvedValueOnce(true); // already processed

    const result = await pollInbox();

    expect(mockMessagesGet).not.toHaveBeenCalled();
    expect(mockMarkProcessed).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test: 404 recovery (stale historyId — HEALTH-02 / D-14)
// ---------------------------------------------------------------------------

describe("pollInbox — 404 recovery", () => {
  it("resets cursor via getProfile() when history.list returns 404", async () => {
    mockGetHistoryId.mockResolvedValueOnce("stale-id");
    mockHistoryList.mockRejectedValueOnce({ code: 404 });
    mockGetProfile.mockResolvedValueOnce({ data: { historyId: "fresh-id" } });

    const result = await pollInbox();

    expect(mockSetHistoryId).toHaveBeenCalledWith("fresh-id");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test: Pagination via nextPageToken
// ---------------------------------------------------------------------------

describe("pollInbox — pagination", () => {
  it("follows nextPageToken to collect messages from multiple pages", async () => {
    mockGetHistoryId.mockResolvedValueOnce("500000");

    // First page
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id: "page1-msg" } }] }],
        historyId: "500010",
        nextPageToken: "token-page-2",
      },
    });
    // Second page
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [{ messagesAdded: [{ message: { id: "page2-msg" } }] }],
        historyId: "500020",
        nextPageToken: undefined,
      },
    });

    mockIsProcessed.mockResolvedValue(false);
    mockMessagesGet.mockResolvedValueOnce(makeMessage("page1-msg"));
    mockMessagesGet.mockResolvedValueOnce(makeMessage("page2-msg"));

    const result = await pollInbox();

    expect(mockHistoryList).toHaveBeenCalledTimes(2);
    expect(mockHistoryList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: "token-page-2" })
    );
    expect(result).toHaveLength(2);
    // Cursor should be from the last page
    expect(mockSetHistoryId).toHaveBeenCalledWith("500020");
  });
});

// ---------------------------------------------------------------------------
// Test: INBOX label filter (belt-and-suspenders — INGEST-04)
// ---------------------------------------------------------------------------

describe("pollInbox — INBOX label filter", () => {
  it("excludes messages that do not have INBOX in labelIds", async () => {
    mockGetHistoryId.mockResolvedValueOnce("600000");
    mockHistoryList.mockResolvedValueOnce({
      data: {
        history: [
          { messagesAdded: [{ message: { id: "sent-msg" } }] },
          { messagesAdded: [{ message: { id: "inbox-msg" } }] },
        ],
        historyId: "600010",
      },
    });
    mockIsProcessed.mockResolvedValue(false);
    // sent-msg has no INBOX label
    mockMessagesGet.mockResolvedValueOnce(makeMessage("sent-msg", ["SENT"]));
    // inbox-msg has INBOX label
    mockMessagesGet.mockResolvedValueOnce(makeMessage("inbox-msg", ["INBOX"]));

    const result = await pollInbox();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("inbox-msg");
    // sent-msg should NOT be markProcessed
    expect(mockMarkProcessed).toHaveBeenCalledWith("inbox-msg");
    expect(mockMarkProcessed).not.toHaveBeenCalledWith("sent-msg");
  });
});
