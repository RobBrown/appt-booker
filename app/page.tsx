import { Suspense } from "react";
import { BookingPage } from "@/components/booking/BookingPage";

const DEFAULT_DURATIONS = [
  { minutes: 15, label: "15 min", hint: "Quick check-in" },
  { minutes: 30, label: "30 min", hint: "Standard meeting" },
  { minutes: 60, label: "60 min", hint: "Deep dive" },
  { minutes: 120, label: "2 hours", hint: "Workshop" },
];

function buildDurations() {
  return DEFAULT_DURATIONS.map((d) => ({
    ...d,
    label:
      process.env[`DURATION_LABEL_${d.minutes}`]?.split("|")[0]?.trim() ||
      d.label,
    hint:
      process.env[`DURATION_LABEL_${d.minutes}`]?.split("|")[1]?.trim() ||
      d.hint,
  }));
}

export default function Home() {
  const hostName = process.env.HOST_NAME ?? "Your Host";
  const contactEmail = process.env.CONTACT_EMAIL ?? process.env.GMAIL_USER ?? "";
  const hostDomain = process.env.HOST_DOMAIN ?? "";
  const defaultLocation = process.env.DEFAULT_LOCATION ?? "zoom";
  const topicChips = process.env.TOPIC_CHIPS
    ? process.env.TOPIC_CHIPS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <Suspense>
      <BookingPage
        hostName={hostName}
        contactEmail={contactEmail}
        hostDomain={hostDomain}
        defaultLocation={defaultLocation}
        durations={buildDurations()}
        topicChips={topicChips}
      />
    </Suspense>
  );
}
