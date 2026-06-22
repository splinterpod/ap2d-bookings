import type { Instrument, User } from "@prisma/client";
import { prisma } from "./db";
import { addDays, dateKey, isoDayOfWeek, localToUtc, startOfWeekUtc } from "./time";

export type StandardHours = {
  days: number[]; // 1=Mon..7=Sun
  start: string; // "HH:mm"
  end: string; // "HH:mm"
};

export const UNLIMITED = -1;

export type LimitOverride = {
  standardHoursWeeklyLimitMinutes: number | null;
  requiresBookingApproval: boolean | null;
} | null;

/** Effective standard-hours weekly cap in minutes; null means unlimited. */
export function effectiveStandardLimit(
  user: Pick<User, "standardHoursWeeklyLimitMinutes">,
  instrument: Pick<Instrument, "standardHoursWeeklyLimitMinutes">,
  perInstrument?: LimitOverride,
): number | null {
  const override =
    perInstrument?.standardHoursWeeklyLimitMinutes ?? user.standardHoursWeeklyLimitMinutes;
  if (override === UNLIMITED) return null;
  if (override !== null && override !== undefined) return override;
  return instrument.standardHoursWeeklyLimitMinutes ?? null;
}

/** Tri-state approval resolution. */
export function requiresApproval(
  user: Pick<User, "requiresBookingApproval">,
  instrument: Pick<Instrument, "defaultRequiresApproval" | "autoConfirmIfTrained">,
  isTrained: boolean,
  perInstrument?: LimitOverride,
): boolean {
  const approvalOverride = perInstrument?.requiresBookingApproval ?? user.requiresBookingApproval;
  if (approvalOverride !== null && approvalOverride !== undefined) {
    return approvalOverride;
  }
  if (instrument.autoConfirmIfTrained && isTrained) return false;
  return instrument.defaultRequiresApproval;
}

export function formatStandardLimitLabel(minutes: number | null): string {
  if (minutes === UNLIMITED || minutes === null) return "Unlimited";
  return `${formatHours(minutes)}/week`;
}

export function formatInstrumentStandardDefault(minutes: number | null): string {
  if (minutes === null) return "Unlimited standard hours/week";
  return `${formatHours(minutes)}/week standard hours`;
}

export function formatInstrumentApprovalDefault(
  instrument: Pick<Instrument, "defaultRequiresApproval" | "autoConfirmIfTrained">,
): string {
  if (instrument.autoConfirmIfTrained && !instrument.defaultRequiresApproval) {
    return "Auto-confirm if trained";
  }
  if (instrument.defaultRequiresApproval) {
    return instrument.autoConfirmIfTrained
      ? "Approval required (auto-confirm if trained is also on)"
      : "Admin approval required";
  }
  return "Auto-confirm all bookings";
}

export function formatApprovalOverride(value: boolean | null): string {
  if (value === null) return "Default";
  return value ? "Always required" : "Auto-confirm";
}

export type SerUserInstrumentLimit = {
  instrumentId: string;
  limitMode: "default" | "custom" | "unlimited";
  customLimitHours: number | null;
  approvalMode: "default" | "auto" | "require";
};

export function buildUserInstrumentLimits(
  instrumentIds: string[],
  records: Array<{
    instrumentId: string;
    standardHoursWeeklyLimitMinutes: number | null;
    requiresBookingApproval: boolean | null;
  }>,
): SerUserInstrumentLimit[] {
  return instrumentIds.map((instrumentId) => {
    const record = records.find((r) => r.instrumentId === instrumentId);
    let limitMode: SerUserInstrumentLimit["limitMode"] = "default";
    let customLimitHours: number | null = null;
    const mins = record?.standardHoursWeeklyLimitMinutes;
    if (mins === UNLIMITED) limitMode = "unlimited";
    else if (mins !== null && mins !== undefined) {
      limitMode = "custom";
      customLimitHours = mins / 60;
    }

    let approvalMode: SerUserInstrumentLimit["approvalMode"] = "default";
    if (record?.requiresBookingApproval === true) approvalMode = "require";
    else if (record?.requiresBookingApproval === false) approvalMode = "auto";

    return { instrumentId, limitMode, customLimitHours, approvalMode };
  });
}

export function parseStandardHours(value: unknown): StandardHours {
  const v = (value ?? {}) as Partial<StandardHours>;
  return {
    days: Array.isArray(v.days) && v.days.length ? v.days : [1, 2, 3, 4, 5],
    start: typeof v.start === "string" ? v.start : "09:00",
    end: typeof v.end === "string" ? v.end : "17:00",
  };
}

function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return end > start ? Math.round((end - start) / 60000) : 0;
}

/** Minutes of [start,end] that fall inside the instrument's standard-hours windows. */
export function standardOverlapMinutes(start: Date, end: Date, sh: StandardHours): number {
  if (end <= start) return 0;
  let total = 0;
  let cursorKey = dateKey(start);
  const endKey = dateKey(end);
  // Iterate each app-timezone calendar day the booking touches.
  for (let guard = 0; guard < 14; guard++) {
    const dayNoon = localToUtc(cursorKey, "12:00");
    if (sh.days.includes(isoDayOfWeek(dayNoon))) {
      const winStart = localToUtc(cursorKey, sh.start);
      const winEnd = localToUtc(cursorKey, sh.end);
      total += overlapMinutes(start, end, winStart, winEnd);
    }
    if (cursorKey === endKey) break;
    cursorKey = dateKey(addDays(dayNoon, 1));
  }
  return total;
}

export function afterHoursLimit(instrument: Pick<Instrument, "afterHoursWeeklyLimitMinutes">): number | null {
  return instrument.afterHoursWeeklyLimitMinutes ?? null;
}

export type WeeklyUsage = {
  standardMinutes: number;
  afterHoursMinutes: number;
  weekStart: Date;
  weekEnd: Date;
};

/**
 * Sum a user's booked standard- and after-hours minutes for the calendar week
 * containing `reference`. Counts CONFIRMED and PENDING bookings; clips to the week.
 */
export async function weeklyUsage(
  userId: string,
  instrumentId: string,
  reference: Date,
  sh: StandardHours,
  excludeBookingId?: string,
): Promise<WeeklyUsage> {
  const weekStart = startOfWeekUtc(reference);
  const weekEnd = addDays(weekStart, 7);

  const bookings = await prisma.booking.findMany({
    where: {
      userId,
      instrumentId,
      status: { in: ["CONFIRMED", "PENDING"] },
      startAt: { lt: weekEnd },
      endAt: { gt: weekStart },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { startAt: true, endAt: true },
  });

  let standardMinutes = 0;
  let afterHoursMinutes = 0;
  for (const b of bookings) {
    const start = b.startAt < weekStart ? weekStart : b.startAt;
    const end = b.endAt > weekEnd ? weekEnd : b.endAt;
    const total = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    const std = standardOverlapMinutes(start, end, sh);
    standardMinutes += std;
    afterHoursMinutes += total - std;
  }

  return { standardMinutes, afterHoursMinutes, weekStart, weekEnd };
}

export async function getUserInstrumentLimitOverride(
  userId: string,
  instrumentId: string,
): Promise<LimitOverride> {
  return prisma.userInstrumentLimit.findUnique({
    where: { userId_instrumentId: { userId, instrumentId } },
    select: {
      standardHoursWeeklyLimitMinutes: true,
      requiresBookingApproval: true,
    },
  });
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

type BookingInterval = { startAt: Date; endAt: Date };

/** True when [newStart, newEnd] is too close to any of the user's existing bookings. */
export function violatesUserBookingGap(
  newStart: Date,
  newEnd: Date,
  existing: BookingInterval[],
  minGapMinutes: number,
): boolean {
  if (minGapMinutes <= 0 || existing.length === 0) return false;
  const minGapMs = minGapMinutes * 60 * 1000;
  for (const b of existing) {
    if (newStart >= b.endAt) {
      if (newStart.getTime() - b.endAt.getTime() < minGapMs) return true;
    } else if (newEnd <= b.startAt) {
      if (b.startAt.getTime() - newEnd.getTime() < minGapMs) return true;
    }
  }
  return false;
}
