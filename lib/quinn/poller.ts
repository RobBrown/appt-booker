import { google, gmail_v1 } from "googleapis";
import { logger, withSpan } from "@hal866245/observability-core";
import { getGoogleAuth } from "@/lib/google-auth";
import {
  getHistoryId,
  setHistoryId,
  isProcessed,
  markProcessed,
} from "@/lib/quinn/dedup";

const log = logger.child({ service: "quinn/poller" });

// ---------------------------------------------------------------------------
// Gmail client factory
// ---------------------------------------------------------------------------

function getGmailClient() {
  return google.gmail({ version: "v1", auth: getGoogleAuth() });
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function isGoogleApiError(err: unknown, code: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === code
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessagePart {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: MessagePart[] | null;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: MessagePart[] | null;
  };
}

// ---------------------------------------------------------------------------
// Main polling function
// ---------------------------------------------------------------------------

/**
 * Poll Gmail inbox for new messages since the last stored historyId cursor.
 *
 * On first run (no historyId in Redis): bootstraps cursor from getProfile()
 * and returns an empty array — no backlog processing (D-02).
 *
 * On subsequent runs: fetches new message IDs via history.list with pagination,
 * deduplicates via Redis, fetches full messages, and filters to INBOX only.
 *
 * On stale historyId (404 from history.list): resets cursor via getProfile()
 * and returns an empty array (HEALTH-02 / D-14).
 */
export async function pollInbox(): Promise<GmailMessage[]> {
  return withSpan("gmail.poll", async (span) => {
  const gmail = getGmailClient();

  // -------------------------------------------------------------------------
  // Bootstrap on first run (D-02)
  // -------------------------------------------------------------------------

  const storedHistoryId = await getHistoryId();

  if (storedHistoryId === null) {
    const profile = await gmail.users.getProfile({ userId: "me" });
    const initialId = profile.data.historyId!;
    await setHistoryId(initialId);
    log.info("Bootstrap: stored initial historyId", { historyId: initialId });
    return [];
  }

  // -------------------------------------------------------------------------
  // Paginated history.list call
  // -------------------------------------------------------------------------

  let pageToken: string | undefined = undefined;
  const allMessageIds: string[] = [];
  let latestHistoryId = storedHistoryId;

  try {
    do {
      const params: gmail_v1.Params$Resource$Users$History$List = {
        userId: "me",
        startHistoryId: storedHistoryId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
        maxResults: 100,
      };
      if (pageToken) {
        params.pageToken = pageToken;
      }
      const res = await gmail.users.history.list(params);

      for (const record of res.data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (added.message?.id) {
            allMessageIds.push(added.message.id);
          }
        }
      }

      // Always capture latest historyId even when history array is empty (Pitfall 1)
      if (res.data.historyId) {
        latestHistoryId = res.data.historyId;
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    // HEALTH-02 / D-14: stale historyId — reset cursor and return empty
    if (isGoogleApiError(err, 404)) {
      const profile = await gmail.users.getProfile({ userId: "me" });
      const newId = profile.data.historyId!;
      await setHistoryId(newId);
      log.info("Stale cursor reset", { historyId: newId });
      return [];
    }
    throw err;
  }

  // Always update cursor after successful pagination (Pitfall 1)
  await setHistoryId(latestHistoryId);

  // -------------------------------------------------------------------------
  // Fetch full messages, dedup, and filter to INBOX
  // -------------------------------------------------------------------------

  const results: GmailMessage[] = [];

  for (const messageId of allMessageIds) {
    // Dedup check
    if (await isProcessed(messageId)) {
      log.info("Skip duplicate", { messageId });
      continue;
    }

    // Fetch full message
    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const msg = msgRes.data;

    // Belt-and-suspenders INGEST-04: ensure INBOX label is present
    if (!msg.labelIds?.includes("INBOX")) {
      log.info("Skip non-INBOX message", { messageId });
      continue;
    }

    // Mark as processed
    await markProcessed(messageId);

    // Body content is base64url-encoded in Gmail API responses (payload.body.data
    // and parts[].body.data). Decoding is deferred to the trust module (Plan 02)
    // which performs MIME tree traversal and HTML stripping (D-12).
    results.push({
      id: msg.id!,
      threadId: msg.threadId!,
      labelIds: msg.labelIds ?? [],
      payload: {
        headers: (msg.payload?.headers ?? []).map((h) => ({
          name: h.name ?? "",
          value: h.value ?? "",
        })),
        mimeType: msg.payload?.mimeType ?? null,
        body: msg.payload?.body
          ? { data: msg.payload.body.data ?? null }
          : null,
        parts: (msg.payload?.parts as MessagePart[] | null | undefined) ?? null,
      },
    });
  }

  span.setAttribute("gmail.messages_fetched", results.length);
  return results;
  });
}
