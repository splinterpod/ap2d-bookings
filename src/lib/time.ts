import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { APP_TIMEZONE } from "./env";

export const TZ = APP_TIMEZONE;

/** Format a UTC Date for display in the app timezone. */
export function formatTz(date: Date, fmt: string): string {
  return formatInTimeZone(date, TZ, fmt);
}

/**
 * Build a UTC instant from wall-clock parts expressed in the app timezone.
 * e.g. localToUtc("2026-06-22", "14:30") => Date (UTC) for 2:30pm Toronto.
 */
export function localToUtc(dateStr: string, timeStr: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, TZ);
}

/** Day of week in app timezone: 1 = Monday ... 7 = Sunday. */
export function isoDayOfWeek(date: Date): number {
  const zoned = toZonedTime(date, TZ);
  const js = zoned.getDay(); // 0 = Sun
  return js === 0 ? 7 : js;
}

/** "HH:mm" wall-clock time in app timezone. */
export function clockTime(date: Date): string {
  return formatInTimeZone(date, TZ, "HH:mm");
}

/** "yyyy-MM-dd" calendar date in app timezone. */
export function dateKey(date: Date): string {
  return formatInTimeZone(date, TZ, "yyyy-MM-dd");
}

/** Monday 00:00 (app tz) of the week containing `date`, as a UTC instant. */
export function startOfWeekUtc(date: Date): Date {
  const zoned = toZonedTime(date, TZ);
  const iso = isoDayOfWeek(date); // 1..7
  zoned.setDate(zoned.getDate() - (iso - 1));
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, "0");
  const d = String(zoned.getDate()).padStart(2, "0");
  return fromZonedTime(`${y}-${m}-${d}T00:00:00`, TZ);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

/** Parse "HH:mm" into minutes from midnight. */
export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Format minutes from midnight as "HH:mm". */
export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Current calendar date + wall-clock in the app timezone. */
export function nowLocal(): { dateKey: string; minutes: number; clock: string } {
  const d = new Date();
  return { dateKey: dateKey(d), minutes: parseClock(clockTime(d)), clock: clockTime(d) };
}

/** End time for a booking range; includes date when on a different day than `startAt`. */
export function formatBookingEnd(startAt: Date, endAt: Date): string {
  return dateKey(startAt) === dateKey(endAt)
    ? formatTz(endAt, "h:mm a")
    : formatTz(endAt, "MMM d, h:mm a");
}

/** e.g. "Jun 30, 3:00 PM – 11:00 PM" or "Jun 30, 3:00 PM – Jul 1, 3:00 PM". */
export function formatBookingRange(
  startAt: Date,
  endAt: Date,
  startFmt: string = "MMM d, h:mm a",
): string {
  const endFmt = dateKey(startAt) === dateKey(endAt) ? "h:mm a" : startFmt;
  return `${formatTz(startAt, startFmt)} – ${formatTz(endAt, endFmt)}`;
}

/** Calendar block labels and full range for tooltips. */
export function formatCalendarBookingLabels(
  startAt: Date,
  endAt: Date,
): { startLabel: string; endLabel: string; rangeLabel: string } {
  return {
    startLabel: formatTz(startAt, "h:mm a"),
    endLabel: formatBookingEnd(startAt, endAt),
    rangeLabel: formatBookingRange(startAt, endAt, "MMM d, h:mm a"),
  };
}
