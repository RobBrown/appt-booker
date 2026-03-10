# Phase 10 — QA, Performance & Launch

**Status:** ⬜ Not started
**Depends on:** Phase 9 signed off
**Reference:** `PRD.md` Section 14 (Acceptance Criteria), Section 9.8 (Accessibility)

---

## Goal

Harden the application, verify all acceptance criteria from the PRD, and ship to production. Nothing new is built in this phase — this is verification, fixing, and launch.

---

## Deliverable

A production-ready application on Render.com that passes every acceptance criterion in `PRD.md` Section 14, meets Lighthouse targets, and is confirmed working end-to-end by the host.

---

## Part 1 — Cross-Browser Testing

Test the full booking flow and the cancel/reschedule flow on all six of the following:

| Browser | Device |
|---|---|
| Chrome | Desktop |
| Chrome | Mobile |
| Firefox | Desktop |
| Firefox | Mobile |
| Safari | Desktop |
| Safari | Mobile (iOS) |

For each combination, complete a full booking end-to-end and verify:
- Duration selection, date selection, time slot selection all work
- Form fields, validation, and conditional logic work correctly
- Booking creates a Google Calendar event
- Confirmation email and SMS are received
- Cancel link in the email loads the correct booking
- Reschedule flow works

Fix any browser-specific issues before proceeding.

---

## Part 2 — Acceptance Criteria Verification

Verify every item from `PRD.md` Section 14. Each must be confirmed true on the production deployment.

- [ ] A user can complete a full booking (duration → date → time → details → confirm) without any page reload
- [ ] Booked time slots become immediately unavailable to other bookers (verify via Freebusy API)
- [ ] A Google Calendar event is created on the host's calendar within 5 seconds of a confirmed booking
- [ ] Confirmation email with `.ics` attachment is sent from `GMAIL_USER` within 60 seconds of booking
- [ ] Host receives a Gmail notification at `GMAIL_USER` within 60 seconds of any new booking
- [ ] Host receives an SMS at `HOST_PHONE_NUMBER` within 60 seconds of any new booking
- [ ] The cancel/reschedule link in the confirmation email correctly identifies and modifies the corresponding Google Calendar event
- [ ] Blocking time in Google Calendar correctly removes those slots from the booking UI
- [ ] The booking page returns a `noindex, nofollow` robots meta tag — verify in page source
- [ ] The booking page displays `[HOST_NAME]` as the only branding element — no photo or bio
- [ ] Bookings are confirmed instantly with no approval step
- [ ] Bookers can cancel or reschedule at any time with no policy restrictions enforced by the app
- [ ] The booking page is fully functional on Chrome, Firefox, and Safari (desktop and mobile)
- [ ] No bookings can be placed outside of the host's availability as defined in Google Calendar
- [ ] The application has no database dependency — all state lives in Google Calendar and environment variables

---

## Part 3 — Lighthouse Audit

Run Lighthouse on the production URL in mobile mode (Chrome DevTools → Lighthouse → Mobile).

**Required scores:**
| Category | Minimum |
|---|---|
| Performance | > 85 |
| Accessibility | > 90 |
| Best Practices | > 90 |

Fix any failures before launch. Common issues to check:
- Image optimization (use `next/image` if any images are present)
- Font loading strategy
- Render-blocking resources
- Contrast ratios (WCAG AA)
- Missing ARIA labels
- Missing alt text

---

## Part 4 — Accessibility Verification

- Full keyboard navigation: tab through the entire booking form, select duration, navigate calendar, select a time slot, fill the form, and submit — all without using a mouse
- Screen reader test with VoiceOver (Safari/macOS) — confirm announcements are correct when a time slot is selected
- Screen reader test with NVDA (Chrome/Windows) — confirm announcements are correct
- All interactive elements have visible focus indicators

---

## Part 5 — Security Checks

- [ ] OAuth2 credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) are not present in the GitHub repository — confirm via `git log` search
- [ ] `.env.local` is in `.gitignore` and has never been committed
- [ ] Cron route rejects requests without the correct `CRON_SECRET` header — verify with a curl request missing the header
- [ ] Cancellation tokens are UUID v4 — inspect a real event's `extendedProperties` in Google Calendar API Explorer to confirm
- [ ] No sensitive booking data (emails, phone numbers) is visible in client-side JavaScript bundles — inspect the built bundle
- [ ] Sentry is not logging full email addresses or phone numbers as PII — review a sample of Sentry events

---

## Part 6 — Sentry Review

Before launch:
- Review the Sentry dashboard for any errors surfaced during QA
- Resolve all open Sentry issues
- Confirm Sentry error alerts are configured to notify `CONTACT_EMAIL`
- Confirm Sentry is receiving events from the production deployment (not just local)

---

## Part 7 — Launch

Complete these steps in order:

1. Confirm all environment variables are correctly set in the Render.com production dashboard — compare against `.env.example` to ensure nothing is missing
2. Confirm the production deployment is on the latest `main` commit
3. Point the production domain (if applicable) to the Render.com deployment
4. Send the host a test booking link and ask him to complete a full booking on production
5. Confirm the host can see the booking appear in his Google Calendar
6. Confirm the host receives the email notification at `GMAIL_USER`
7. Confirm the host receives the SMS notification at `HOST_PHONE_NUMBER`
8. Confirm the host can cancel and reschedule via the link in the confirmation email
9. Manually trigger `POST /api/cron/reminders` on production and confirm reminders are sent

---

## Sign-off Checklist

Before marking this phase complete and calling the project launched, confirm:

- [ ] All cross-browser tests pass (6 browser/device combinations)
- [ ] All 15 acceptance criteria from `PRD.md` Section 14 verified on production
- [ ] Lighthouse mobile scores: Performance > 85, Accessibility > 90, Best Practices > 90
- [ ] Full keyboard navigation works end-to-end
- [ ] Screen reader compatibility confirmed on VoiceOver and NVDA
- [ ] All security checks pass
- [ ] Sentry dashboard is clean — no unresolved errors
- [ ] Sentry error alerts are configured and active
- [ ] Host has completed a real test booking on production
- [ ] Host is receiving email and SMS notifications correctly on production
- [ ] Host can see bookings in his Google Calendar correctly
- [ ] Cron reminders work correctly on production

**Launch complete.**
