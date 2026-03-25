# Roadmap: Quinn AI Email Assistant

## Milestone 1: Quinn v1

---

### Phase 1: Inbox Infrastructure & Security Foundation

**Goal:** The cron pipeline reliably ingests new emails from the trusted inbox, deduplicates them, and enforces all security boundaries — before any LLM or booking logic runs.

**Requirements covered:** INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05, INGEST-06, TRUST-01, TRUST-02, TRUST-03, TRUST-04, HEALTH-01, HEALTH-02, HEALTH-03

**Success criteria (what must be TRUE when this phase completes):**
1. A Render cron hitting `/api/cron/quinn-poll` every 5 minutes fetches new Gmail history and stores the `historyId` cursor in Upstash Redis — confirmed by Redis inspection after a real email arrives.
2. Sending a second cron trigger with the same `historyId` produces no duplicate processing — the messageId dedup gate skips it and logs accordingly.
3. An email arriving from a non-allowlisted sender is silently discarded — no reply is sent, no error is thrown, Sentry receives no exception.
4. An email with `Auto-Submitted` header or where `From` is `quickreplyrob@gmail.com` is discarded before any further processing.
5. ~~A second daily Render cron (`/api/cron/quinn-watch`) fires without error and logs the Gmail watch expiration timestamp to Redis — confirming watch renewal is operational.~~ (Removed per D-13 — no watch needed with polling-only approach. HEALTH-01 descoped.)

**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Cron poll route & Redis state (dedup, poller, cron route with CRON_SECRET auth and error alerting)
- [x] 01-02-PLAN.md — Trust & security gate (allowlist, DMARC, auto-reply guard, self-send guard, HTML stripping, wired into cron route)

---

### Phase 2: Intelligence Layer

**Goal:** For every trusted email that clears the security gate, Quinn extracts a structured, validated intent — with smart defaults filling any gaps — ready for service calls.

**Requirements covered:** NLU-01, NLU-02, NLU-03, NLU-04, NLU-05, DEFAULT-01, DEFAULT-02, DEFAULT-03, DEFAULT-04

**Success criteria (what must be TRUE when this phase completes):**
1. Passing a plain-text booking email ("Quinn, can you book a 30-min call with Sarah next Tuesday?") to `parseIntent()` returns a Zod-validated JSON object with `intent: "book"`, a resolved ISO date for the next Tuesday, `duration: 30`, and `timezone: "America/Toronto"` — with all three assumptions listed in the `assumptions` array.
2. Passing a cancellation email that references no specific token returns `intent: "cancel"` with `confidence: "low"` and a non-empty `clarificationQuestion`.
3. Passing an email with an unrecognisable instruction returns `intent: "unknown"` — Quinn's reply path for this case states what she can do, not an error message.
4. Current date is injected into every Claude call — confirmed by logging the system prompt during a test run — so relative dates ("Thursday") resolve correctly without hardcoding.

**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Claude NLU module (Zod intent schema, Anthropic SDK integration, parseIntent() with forced tool use and retry logic)
- [x] 02-02-PLAN.md — Smart defaults & date resolution (duration/timezone fallbacks, relative day resolution with date-fns, assumptions tracking)

---

### Phase 3: Actions & Reply

**Goal:** Quinn takes the parsed intent, calls the existing service layer to fulfil it, and replies in-thread as a warm human assistant — with full observability on every step.

**Requirements covered:** ACTION-01, ACTION-02, ACTION-03, ACTION-04, ACTION-05, ACTION-06, REPLY-01, REPLY-02, REPLY-03, REPLY-04, REPLY-05, OBS-01, OBS-02

**Success criteria (what must be TRUE when this phase completes):**
1. Rob emails "Quinn, book a zoom call with dan@example.com for next Friday at 2pm" — Quinn creates the Google Calendar event, threads a reply back to Rob (and Dan) with the booking details and a management link, all within one cron cycle.
2. When the requested slot is unavailable, Quinn books the closest open slot instead and the reply explicitly states the time substitution ("2pm was taken, so I've booked 3pm instead").
3. Rob emails "Quinn, cancel my meeting" in a thread that contains a prior Quinn confirmation — Quinn extracts the token from that prior reply URL, cancels the event, and confirms in a new reply.
4. Every Quinn action (email received, trust check outcome, intent parsed, service called, reply sent) appears as a PostHog event and any caught exception is visible in Sentry — without crashing the cron job.
5. Quinn's reply reads as a human assistant note (warm, first-person, concise) — it signs as "Quinn", states every assumption made, and contains no mention of AI, automation, or error codes.

**Plans:** 1/2 plans executed

Plans:
- [x] 03-01-PLAN.md — Processor & service wiring (processor.ts pipeline orchestrator, action dispatch, attendee extraction, token extraction, closest-slot fallback)
- [ ] 03-02-PLAN.md — Reply composition & Gmail send (responder.ts reply formatter, mailer.ts threading sender, cron route wiring, PostHog/Sentry observability)

---

## Success Criteria

Quinn v1 is done when:

- Rob can CC `quickreplyrob@gmail.com` on an email thread and receive a booking confirmation reply within 10 minutes.
- All four action types (book, reschedule, cancel, check availability) work end-to-end with real Google Calendar events.
- Non-Rob senders never receive a reply from Quinn, regardless of what they write.
- No cron run has ever thrown an unhandled exception — all errors are caught, reported to Sentry, and (where appropriate) turned into a Quinn reply.
- The Gmail watch has not lapsed silently — the daily renewal cron is running and its last execution is logged in Redis.
- `npm run build` and `npm run test` pass with no errors.

---

## Dependencies & Prerequisites

The following must be in place before Phase 1 coding begins:

1. **`ANTHROPIC_API_KEY`** — Obtain from console.anthropic.com and add to `.env.local` and Render environment. Required by Phase 2; Phase 1 has no Claude dependency so work can begin without it.
2. **Gmail watch topic name** — Even with cron polling, `gmail.users.watch()` is called by the daily renewal cron to keep the historyId cursor valid. The Pub/Sub topic name (or an equivalent placeholder for polling-only mode) must be decided before the watch renewal cron is written. With cron polling chosen, the watch call is still required to receive historyIds; confirm the existing Google Cloud project has a topic provisioned or simplify to history-list-only if watch is skipped entirely.
3. **Render cron entries** — Two new cron jobs must be added in the Render dashboard (or `render.yaml`): the 5-minute poll (`*/5 * * * *`) and the daily watch renewal (`0 8 * * *`). Both use the existing `CRON_SECRET` env var.
4. **`QUINN_TRUSTED_SENDERS` env var (optional)** — Allowlist can be seeded via env var override. If not set, the hardcoded list from TRUST-01 is used.

No new infrastructure services are required beyond what is already running (Upstash Redis, Gmail API OAuth, Sentry, PostHog).

---

*Created: 2026-03-24*
