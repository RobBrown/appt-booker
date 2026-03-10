import { addDays, isWeekend, startOfToday, isBefore } from "date-fns";

export function hasMockAvailability(date: Date): boolean {
  const today = startOfToday();
  if (isBefore(date, today)) return false;
  if (isWeekend(date)) return false;
  // Block a few specific days for realistic variety
  const dom = date.getDate();
  return dom % 7 !== 3 && dom % 11 !== 0;
}

export function getNext7AvailableDays(): Date[] {
  const result: Date[] = [];
  let d = addDays(startOfToday(), 1);
  while (result.length < 7) {
    if (hasMockAvailability(d)) result.push(new Date(d));
    d = addDays(d, 1);
  }
  return result;
}

export interface SlotGroups {
  morning: string[];
  afternoon: string[];
  evening: string[];
}

const MORNING = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];
const AFTERNOON = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

export function getMockSlots(duration: number): SlotGroups {
  const fits = (slot: string, endHour: number) => {
    const [h, m] = slot.split(":").map(Number);
    return h * 60 + m + duration <= endHour * 60;
  };
  return {
    morning: MORNING.filter((s) => fits(s, 12)),
    afternoon: AFTERNOON.filter((s) => fits(s, 17)),
    evening: [],
  };
}
