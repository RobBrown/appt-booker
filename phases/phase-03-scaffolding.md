# Phase 3 — Project Scaffolding & Repository Setup

**Status:** ⬜ Not started
**Depends on:** Phase 2 signed off
**Reference:** `PRD.md` Section 11 (Tech Stack), Section 8.5 (Environment Variables)

---

## Goal

Create the Next.js project with all dependencies installed and configured. Deploy a working skeleton to Render.com. No application features built yet — just a clean, deployable foundation with Sentry active from day one.

---

## Deliverable

A GitHub repository containing a running Next.js app that:
- Renders a placeholder page at the root route (`/`)
- Deploys successfully to Render.com
- Has all required dependencies installed
- Has Sentry capturing errors from the deployed app
- Has push-to-deploy active (every push to `main` triggers a Render.com redeploy)

---

## Tasks

### 1. Initialise the Next.js Project
- Next.js with App Router
- TypeScript enabled
- No `src/` directory — use the root `app/` convention

### 2. Install All Dependencies

```bash
# UI & styling
npm install tailwindcss @tailwindcss/forms
npx shadcn@latest init

# Date & timezone
npm install date-fns date-fns-tz

# Icons
npm install lucide-react

# Google APIs
npm install googleapis

# Twilio
npm install twilio

# Sentry
npm install @sentry/nextjs
```

### 3. Configure Tailwind CSS
- Standard Next.js + Tailwind setup
- Include `@tailwindcss/forms` plugin

### 4. Configure shadcn/ui
- Use the design decisions from Phase 2 (colors, border radius) when initialising shadcn
- Install any shadcn components that will be needed: `button`, `card`, `input`, `textarea`, `badge`, `separator`

### 5. Create `.env.example`
Create `.env.example` at the repo root with all variable names and blank values. This file is committed to the repository. Never commit `.env.local`.

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=
GMAIL_USER=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
HOST_PHONE_NUMBER=
SENTRY_DSN=
DEFAULT_LOCATION=
DEFAULT_ADDRESS=
CONTACT_EMAIL=
CRON_SECRET=
DURATION_LABEL_15=
DURATION_LABEL_30=
DURATION_LABEL_60=
DURATION_LABEL_120=
TOPIC_CHIPS=
LATE_MESSAGE_DELAY_MINUTES=
```

### 6. Configure Sentry
Run the Sentry Next.js wizard:
```bash
npx @sentry/wizard@latest -i nextjs
```
- Configure `sentry.client.config.ts` and `sentry.server.config.ts`
- Sentry must be active and capturing errors before any feature development begins
- Add `SENTRY_DSN` to `.env.local` with the real value

### 7. Add `noindex` Meta Tag
In the root `app/layout.tsx`, add:
```tsx
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
}
```

### 8. Placeholder Root Page
`app/page.tsx` should render a simple placeholder:
- The text "[HOST_NAME] Appointment Scheduler — Coming Soon"
- No styling required — this is replaced in Phase 6

### 9. Render.com Setup
- Connect the GitHub repository to Render.com
- Set build command: `npm run build`
- Set start command: `npm run start`
- Configure all environment variables from `.env.example` in the Render.com dashboard (use real values)
- Enable auto-deploy on push to `main`
- Add a placeholder Cron Job in Render.com: POST to `/api/cron/reminders` every hour — no route logic yet, the endpoint does not need to exist at this phase

### 10. Confirm Clean Build
- `npm run build` completes with no errors
- `npm run lint` returns no errors
- Deployed app on Render.com renders the placeholder page

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] `npm run build` passes with no errors
- [ ] `npm run lint` passes with no errors
- [ ] App deploys to Render.com and renders the placeholder page
- [ ] Push to `main` on GitHub triggers an automatic redeploy on Render.com
- [ ] All dependencies are present in `package.json`
- [ ] `.env.example` is committed with all variable names and blank values
- [ ] `.env.local` is in `.gitignore` and not committed
- [ ] Sentry is receiving events from the deployed app (trigger a test error to confirm)
- [ ] `noindex` meta tag is present in the deployed page source
- [ ] Render.com cron job placeholder is configured
