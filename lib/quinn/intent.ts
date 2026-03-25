import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared base fields — spread into each variant (Zod v4 requires plain
// z.object() for discriminated union variants; no transforms here — Pitfall 3)
// ---------------------------------------------------------------------------

// Pitfall 6: preprocess "null" string → JSON null for rawDateText and nullable
// string fields, since LLMs sometimes return the string "null" instead of
// the JSON null literal.
const nullableString = z.preprocess(
  (v) => (v === "null" ? null : v),
  z.string().nullable()
);

const BaseIntentFields = {
  confidence: z.enum(["high", "medium", "low"]),
  rawDateText: nullableString,
  assumptions: z.array(z.string()),
};

// ---------------------------------------------------------------------------
// 5 intent variant schemas
// ---------------------------------------------------------------------------

export const BookIntentSchema = z.object({
  intent: z.literal("book"),
  ...BaseIntentFields,
  requestedDate: nullableString,
  duration: z.number().nullable(),
  timezone: nullableString,
  attendeeNames: z.array(z.string()),
});

export const RescheduleIntentSchema = z.object({
  intent: z.literal("reschedule"),
  ...BaseIntentFields,
  bookingReference: nullableString,
  requestedDate: nullableString,
  timezone: nullableString,
});

export const CancelIntentSchema = z.object({
  intent: z.literal("cancel"),
  ...BaseIntentFields,
  bookingReference: nullableString,
});

export const CheckAvailabilityIntentSchema = z.object({
  intent: z.literal("check_availability"),
  ...BaseIntentFields,
  requestedDate: nullableString,
  duration: z.number().nullable(),
  timezone: nullableString,
});

export const UnknownIntentSchema = z.object({
  intent: z.literal("unknown"),
  ...BaseIntentFields,
  clarificationQuestion: z.string(),
});

// ---------------------------------------------------------------------------
// Discriminated union over all 5 variants
// ---------------------------------------------------------------------------

export const IntentSchema = z.discriminatedUnion("intent", [
  BookIntentSchema,
  RescheduleIntentSchema,
  CancelIntentSchema,
  CheckAvailabilityIntentSchema,
  UnknownIntentSchema,
]);

// ---------------------------------------------------------------------------
// TypeScript types (inferred from Zod)
// ---------------------------------------------------------------------------

export type BookIntent = z.infer<typeof BookIntentSchema>;
export type RescheduleIntent = z.infer<typeof RescheduleIntentSchema>;
export type CancelIntent = z.infer<typeof CancelIntentSchema>;
export type CheckAvailabilityIntent = z.infer<
  typeof CheckAvailabilityIntentSchema
>;
export type UnknownIntent = z.infer<typeof UnknownIntentSchema>;
export type Intent = z.infer<typeof IntentSchema>;
