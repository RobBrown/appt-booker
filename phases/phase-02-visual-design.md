# Phase 2 — Visual Design Mockup

**Status:** ⬜ Not started
**Depends on:** Phase 1 signed off
**Reference:** `PRD.md` Section 5, Section 7 (Tone Guide), Section 9.5 (Dark Mode)

---

## Goal

Apply visual design to the approved wireframe from Phase 1. Define and implement all visual decisions: color, typography, spacing, component styling, and dark mode. Still static HTML — no interactivity, no real data. The output of this phase is the visual reference the developer matches exactly in Phase 6.

---

## Deliverable

A single file: `design-mockup.html`

A polished static HTML mockup of the full booking page rendered in a browser. Must include both light and dark mode — either via a toggle button in the mockup, or as two separate sections on the page.

---

## Design Decisions to Make and Apply

Make all of the following decisions and implement them in the mockup. Document each decision inline as an HTML comment so they are easy to reference later.

### Color Palette
- Primary / brand color (used for selected states, CTA button, highlights)
- Secondary / accent color
- Background color (light and dark variants)
- Surface color (cards, inputs — light and dark variants)
- Text colors: primary, secondary, muted (light and dark variants)
- Disabled state color
- Error state color
- Success state color

### Typography
- Heading font (name and weight)
- Body font (name and weight)
- Label font (name and weight)
- Type scale (sizes for h1, h2, body, label, caption)

### Component Styling
- Duration selector cards: default, hover, selected states
- Calendar grid: day cell default, available, unavailable, selected, today states
- Next 7 days pill chips: default, selected states
- Time slot items: default, hover, selected states
- Location type segmented selector: default, selected states
- Form inputs: default, focus, error states
- "Confirm Booking" CTA button: default, hover, disabled states
- Confirmation screen success state

### Layout & Spacing
- Desktop two-column layout (calendar left, form right — or equivalent)
- Sticky summary sidebar on desktop
- Spacing scale (base unit and multiples)
- Border radius decisions

### Dark Mode
- Must respect `prefers-color-scheme: dark` in CSS
- All components must have correct dark mode variants
- Contrast must remain WCAG 2.1 AA compliant in both modes

### [HOST_NAME] Treatment
- How the host's name appears at the top of the page — size, weight, position

---

## Constraints

- No external CSS frameworks in the mockup — write all styles inline or in a `<style>` tag so the file is fully self-contained
- No JavaScript required — this is a visual reference only
- All states (selected, hover, disabled, error) must be visually represented somewhere in the mockup — use static examples for states that would normally require interaction

---

## Sign-off Checklist

Before marking this phase complete, confirm:

- [ ] Light mode renders correctly
- [ ] Dark mode renders correctly
- [ ] All color palette decisions are documented in HTML comments
- [ ] All typography decisions are documented in HTML comments
- [ ] All four steps are styled and visible
- [ ] Duration cards show default and selected states
- [ ] Calendar shows available, unavailable, and selected day states
- [ ] Time slots show default and selected states
- [ ] Form inputs show default and error states
- [ ] CTA button shows default and disabled states
- [ ] Confirmation screen is styled
- [ ] Mobile layout is shown (separate section or responsive)
- [ ] File is fully self-contained — renders without external dependencies
