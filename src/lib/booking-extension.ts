import "server-only";
import type { Booking, Instrument, InstrumentSession } from "@prisma/client";
import { prisma } from "./db";
import { addMinutes, clockTime, formatBookingEnd, localToUtc, parseClock } from "./time";
import {
  BOOKING_GRID_MINUTES,
  buildStartSlotOptions,
  isOnBookingGrid,
  type OccupiedRange,
} from "./booking-grid";
import {
  effectiveStandardLimit,
  getUserInstrumentLimitOverride,
  parseStandardHours,
  standardOverlapMinutes,
  violatesUserBookingGap,
  weeklyUsage,
  formatHours,
} from "./booking";

export type ExtensionOption = {
  newEndAtIso: string;
  label: string;
  extraMinutes: number;
};

export type DurationOption = { minutes: number; endLabel: string };

export type ExtensionInfo = {
  canExtend: boolean;
  reason?: string;
  options: ExtensionOption[];
  currentEndLabel: string;
  bookingId: string;
};

export type MemberNowState = {
  extension: {
    bookingId: string;
    currentEndLabel: string;
    options: ExtensionOption[];
  } | null;
  bookNow: {
    dateKey: string;
    startMin: number;
    durationOptions: DurationOption[];
  } | null;
  unavailableReason?: string;
};

type BookingRow = Pick<Booking, "id" | "userId" | "startAt" | "endAt" | "scheduledEndAt" | "status" | "instrumentId"> & {
  session?: Pick<InstrumentSession, "signedOutAt"> | null;
};

export async function instrumentInUse(instrumentId: string): Promise<boolean> {
  const open = await prisma.instrumentSession.findFirst({
    where: { signedOutAt: null, booking: { instrumentId } },
    select: { id: true },
  });
  return open !== null;
}

/** Latest end time without overlapping the next booking. */
export async function maxFreeEndAt(
  instrumentId: string,
  fromEndAt: Date,
  bookingStartAt: Date,
  instrument: Pick<Instrument, "advanceBookingDays">,
  excludeBookingId?: string,
): Promise<Date> {
  const next = await prisma.booking.findFirst({
    where: {
      instrumentId,
      status: { in: ["CONFIRMED", "PENDING"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      startAt: { gte: fromEndAt },
    },
    orderBy: { startAt: "asc" },
    select: { startAt: true },
  });

  const advanceLimit = addMinutes(bookingStartAt, instrument.advanceBookingDays * 24 * 60);
  const candidates = [advanceLimit];
  if (next && next.startAt > fromEndAt) {
    candidates.push(next.startAt);
  }
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

export function buildDurationOptionsFromStart(
  startAt: Date,
  maxEndAt: Date,
  slotMinutes: number,
): DurationOption[] {
  const opts: DurationOption[] = [];
  let cursor = addMinutes(startAt, slotMinutes);
  while (cursor <= maxEndAt) {
    opts.push({
      minutes: Math.round((cursor.getTime() - startAt.getTime()) / 60000),
      endLabel: formatBookingEnd(startAt, cursor),
    });
    cursor = addMinutes(cursor, slotMinutes);
  }
  return opts;
}

export function buildExtensionOptions(
  bookingStartAt: Date,
  currentEndAt: Date,
  maxEndAt: Date,
  slotMinutes: number,
): ExtensionOption[] {
  const opts: ExtensionOption[] = [];
  let cursor = addMinutes(currentEndAt, slotMinutes);
  while (cursor <= maxEndAt) {
    const endMin = parseClock(clockTime(cursor));
    if (!isOnBookingGrid(endMin, BOOKING_GRID_MINUTES)) {
      cursor = addMinutes(cursor, slotMinutes);
      continue;
    }
    const extraMinutes = Math.round((cursor.getTime() - currentEndAt.getTime()) / 60000);
    opts.push({
      newEndAtIso: cursor.toISOString(),
      label: `${formatBookingEnd(bookingStartAt, cursor)} (+${fmtShort(extraMinutes)})`,
      extraMinutes,
    });
    cursor = addMinutes(cursor, slotMinutes);
  }
  return opts;
}

function fmtShort(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Booking in progress (started, not ended, not signed out). */
export async function findOngoingBooking(
  userId: string,
  instrumentId: string,
  now = new Date(),
) {
  return prisma.booking.findFirst({
    where: {
      userId,
      instrumentId,
      status: "CONFIRMED",
      startAt: { lte: now },
      endAt: { gt: now },
      OR: [{ session: null }, { session: { signedOutAt: null } }],
    },
    include: { session: { select: { signedOutAt: true } } },
  });
}

export async function resolveBookingExtension(
  booking: BookingRow,
  instrument: Instrument,
  actingUserId: string,
  isAdmin: boolean,
  now = new Date(),
): Promise<ExtensionInfo> {
  const base: ExtensionInfo = {
    canExtend: false,
    options: [],
    currentEndLabel: formatBookingEnd(booking.startAt, booking.endAt),
    bookingId: booking.id,
  };

  if (booking.status !== "CONFIRMED") {
    return { ...base, reason: "Only confirmed bookings can be extended." };
  }
  if (!instrument.bookingAdminMode) {
    return { ...base, reason: "Extensions are only available in booking admin mode." };
  }
  if (booking.endAt <= now || booking.startAt > now) {
    return { ...base, reason: "Only an ongoing booking can be extended." };
  }
  if (booking.session?.signedOutAt) {
    return { ...base, reason: "You have already signed out of this session." };
  }
  if (booking.userId !== actingUserId && !isAdmin) {
    return { ...base, reason: "You can only extend your own bookings." };
  }
  if (instrument.maintenance) {
    return { ...base, reason: "Instrument is under maintenance." };
  }
  if (await instrumentInUse(instrument.id)) {
    const open = await prisma.instrumentSession.findFirst({
      where: { signedOutAt: null, booking: { instrumentId: instrument.id, userId: { not: booking.userId } } },
      select: { id: true },
    });
    if (open) {
      return { ...base, reason: "The instrument is in use by someone else right now." };
    }
  }

  const maxEnd = await maxFreeEndAt(
    booking.instrumentId,
    booking.endAt,
    booking.startAt,
    instrument,
    booking.id,
  );
  const options = buildExtensionOptions(booking.startAt, booking.endAt, maxEnd, instrument.slotMinutes);
  if (options.length === 0) {
    return { ...base, reason: "No free time to extend into — the next booking is too close." };
  }

  return { ...base, canExtend: true, options };
}

export async function validateBookingExtension(
  booking: BookingRow,
  instrument: Instrument,
  bookForUserId: string,
  newEndAt: Date,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newEndAt <= booking.endAt) {
    return { ok: false, error: "New end time must be after your current end time." };
  }

  const endMin = parseClock(clockTime(newEndAt));
  if (!isOnBookingGrid(endMin, BOOKING_GRID_MINUTES)) {
    return { ok: false, error: `End time must be on a ${BOOKING_GRID_MINUTES}-minute interval.` };
  }

  const maxEnd = await maxFreeEndAt(
    booking.instrumentId,
    booking.endAt,
    booking.startAt,
    instrument,
    booking.id,
  );
  if (newEndAt > maxEnd) {
    return { ok: false, error: "That extension overlaps the next booking or exceeds the booking window." };
  }

  const overlap = await prisma.booking.findFirst({
    where: {
      instrumentId: booking.instrumentId,
      status: { in: ["CONFIRMED", "PENDING"] },
      id: { not: booking.id },
      startAt: { lt: newEndAt },
      endAt: { gt: booking.startAt },
    },
  });
  if (overlap) {
    return { ok: false, error: "That extension overlaps another booking." };
  }

  if (instrument.minGapBetweenUserBookingsMinutes > 0) {
    const others = await prisma.booking.findMany({
      where: {
        userId: bookForUserId,
        instrumentId: booking.instrumentId,
        status: { in: ["CONFIRMED", "PENDING"] },
        id: { not: booking.id },
      },
      select: { startAt: true, endAt: true },
    });
    if (
      violatesUserBookingGap(
        booking.startAt,
        newEndAt,
        others,
        instrument.minGapBetweenUserBookingsMinutes,
      )
    ) {
      return {
        ok: false,
        error: `Your bookings on this instrument must be at least ${formatHours(instrument.minGapBetweenUserBookingsMinutes)} apart.`,
      };
    }
  }

  const sh = parseStandardHours(instrument.standardHours);
  const bookForUser = await prisma.user.findUnique({ where: { id: bookForUserId } });
  if (!bookForUser) return { ok: false, error: "User not found." };

  const limitOverride = await getUserInstrumentLimitOverride(bookForUserId, instrument.id);
  const limit = effectiveStandardLimit(bookForUser, instrument, limitOverride);
  if (limit !== null) {
    const usage = await weeklyUsage(bookForUserId, instrument.id, booking.startAt, sh);
    const addedStandard = standardOverlapMinutes(booking.endAt, newEndAt, sh);
    if (usage.standardMinutes + addedStandard > limit) {
      const remaining = Math.max(0, limit - usage.standardMinutes);
      return {
        ok: false,
        error: `Extension exceeds your weekly standard-hours limit. You have ${formatHours(remaining)} remaining.`,
      };
    }
  }

  if (newEndAt <= now) {
    return { ok: false, error: "New end time must be in the future." };
  }

  return { ok: true };
}

export function occupiedRangesFromBookings(
  dayKey: string,
  bookings: Array<{ startKey: string; startMin: number; endKey: string; endMin: number }>,
): OccupiedRange[] {
  return bookings
    .filter((b) => b.startKey <= dayKey && b.endKey >= dayKey)
    .map((b) => {
      const start = b.startKey === dayKey ? b.startMin : 0;
      const end = b.endKey === dayKey ? b.endMin : 1440;
      return [start, end] as OccupiedRange;
    });
}

/** Walk-up book-now vs extend for a trained member on an admin-mode instrument. */
export async function buildMemberNowState(
  userId: string,
  instrument: Instrument,
  serBookings: Array<{ startKey: string; startMin: number; endKey: string; endMin: number }>,
  nowKey: string,
  nowMin: number,
  now = new Date(),
): Promise<MemberNowState> {
  const empty: MemberNowState = { extension: null, bookNow: null };

  if (!instrument.bookingAdminMode || instrument.maintenance) {
    return empty;
  }

  const ongoing = await findOngoingBooking(userId, instrument.id, now);
  if (ongoing) {
    const ext = await resolveBookingExtension(ongoing, instrument, userId, false, now);
    if (ext.canExtend) {
      return {
        extension: {
          bookingId: ext.bookingId,
          currentEndLabel: ext.currentEndLabel,
          options: ext.options,
        },
        bookNow: null,
      };
    }
    return { ...empty, unavailableReason: ext.reason ?? "Your booking cannot be extended right now." };
  }

  if (await instrumentInUse(instrument.id)) {
    return { ...empty, unavailableReason: "The instrument is in use right now." };
  }

  const slots = buildStartSlotOptions({
    dayKey: nowKey,
    nowKey,
    nowMin,
    duration: instrument.slotMinutes,
    occupied: occupiedRangesFromBookings(nowKey, serBookings),
    minNoticeMinutes: 0,
  });
  const nowSlot = slots.find((s) => s.isNow && !s.busy);
  if (!nowSlot) {
    return { ...empty, unavailableReason: "The current time slot is not available." };
  }

  const startTime = `${String(Math.floor(nowSlot.value / 60)).padStart(2, "0")}:${String(nowSlot.value % 60).padStart(2, "0")}`;
  const startAt = localToUtc(nowKey, startTime);
  const maxEnd = await maxFreeEndAt(instrument.id, startAt, startAt, instrument);
  const durationOptions = buildDurationOptionsFromStart(startAt, maxEnd, instrument.slotMinutes);
  if (durationOptions.length === 0) {
    return { ...empty, unavailableReason: "No free time available from now." };
  }

  return {
    extension: null,
    bookNow: {
      dateKey: nowKey,
      startMin: nowSlot.value,
      durationOptions,
    },
  };
}
