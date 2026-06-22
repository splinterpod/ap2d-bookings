import {
  BOOKING_GRID_MINUTES,
  bumpStartPastOccupied,
  earliestBookableStart,
  snapDown,
  snapUp,
  type OccupiedRange,
} from "@/lib/booking-grid";

export type CalendarBooking = {
  startKey: string;
  startMin: number;
  endKey: string;
  endMin: number;
};

export type DragSelection = {
  dayKey: string;
  startMin: number;
  endMin: number;
};

export function getOccupiedRanges(dayKey: string, bookings: CalendarBooking[]): OccupiedRange[] {
  const ranges: OccupiedRange[] = [];
  for (const b of bookings) {
    if (b.startKey === dayKey) {
      ranges.push([b.startMin, b.endKey === dayKey ? b.endMin : 1440]);
    } else if (b.endKey === dayKey && b.startKey < dayKey) {
      ranges.push([0, b.endMin]);
    }
  }
  return ranges;
}

export function isRangeFree(
  dayKey: string,
  start: number,
  end: number,
  bookings: CalendarBooking[],
): boolean {
  const occupied = getOccupiedRanges(dayKey, bookings);
  return !occupied.some(([os, oe]) => start < oe && end > os);
}

export function yToMinutes(y: number, hourPx: number): number {
  return Math.max(0, Math.min(1440, Math.round((y / hourPx) * 60)));
}

export function minutesFromColumnEvent(
  clientY: number,
  columnTop: number,
  hourPx: number,
  grid: number = BOOKING_GRID_MINUTES,
): number {
  return snapDown(yToMinutes(clientY - columnTop, hourPx), grid);
}

export function normalizeDragRange(args: {
  anchorMin: number;
  currentMin: number;
  dayKey: string;
  nowKey: string;
  nowMin: number;
  slotMinutes: number;
  maxSessionMinutes: number;
  minNoticeMinutes: number;
  occupied: OccupiedRange[];
}): { start: number; duration: number } | null {
  const {
    anchorMin,
    currentMin,
    dayKey,
    nowKey,
    nowMin,
    slotMinutes,
    maxSessionMinutes,
    minNoticeMinutes,
    occupied,
  } = args;

  const grid = BOOKING_GRID_MINUTES;
  const minStart = earliestBookableStart({
    dayKey,
    nowKey,
    nowMin,
    duration: slotMinutes,
    occupied,
    minNoticeMinutes,
    grid,
  });
  if (minStart >= 1440) return null;

  let start = snapDown(Math.min(anchorMin, currentMin), grid);
  let end = snapUp(Math.max(anchorMin, currentMin), grid);

  if (end <= start) end = start + slotMinutes;
  if (start < minStart) start = minStart;
  if (end > 1440) end = 1440;

  let duration = end - start;
  if (duration < slotMinutes) duration = slotMinutes;
  if (duration > maxSessionMinutes) {
    duration = Math.floor(maxSessionMinutes / slotMinutes) * slotMinutes;
    end = start + duration;
  }
  duration = Math.floor(duration / slotMinutes) * slotMinutes;
  if (duration < slotMinutes) return null;

  end = start + duration;
  if (end > 1440) {
    end = 1440;
    start = end - duration;
    if (start < minStart) return null;
  }

  start = bumpStartPastOccupied(start, duration, occupied, grid);
  if (start + duration > 1440) return null;
  if (start < minStart) return null;

  return { start, duration };
}

export function isDragRangeBookable(args: {
  dayKey: string;
  start: number;
  duration: number;
  dayIndex: number;
  advanceBookingDays: number;
  bookings: CalendarBooking[];
}): boolean {
  const { dayKey, start, duration, dayIndex, advanceBookingDays, bookings } = args;
  if (dayIndex < 0 || dayIndex > advanceBookingDays) return false;
  const end = start + duration;
  return isRangeFree(dayKey, start, end, bookings);
}

export { BOOKING_GRID_MINUTES, snapDown, snapUp };
