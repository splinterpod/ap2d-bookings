"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/env";
import { createBookingSchema } from "@/lib/validation";
import { addMinutes, formatTz, localToUtc, clockTime, parseClock } from "@/lib/time";
import {
  BOOKING_GRID_MINUTES,
  isOnBookingGrid,
  nowBlockStart,
} from "@/lib/booking-grid";
import {
  effectiveStandardLimit,
  formatHours,
  getUserInstrumentLimitOverride,
  parseStandardHours,
  requiresApproval,
  standardOverlapMinutes,
  weeklyUsage,
} from "@/lib/booking";
import { notifyNextOnWaitlist } from "./waitlist";

export type FormState = { error?: string; success?: string } | undefined;

export async function createBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") return { error: "Your account is not active." };

  const parsed = createBookingSchema.safeParse({
    instrumentId: formData.get("instrumentId"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    durationMinutes: formData.get("durationMinutes"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid booking." };
  const { instrumentId, date, startTime, durationMinutes, notes } = parsed.data;

  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return { error: "Instrument not found." };
  if (instrument.maintenance) return { error: "This instrument is under maintenance and cannot be booked." };

  const startAt = localToUtc(date, startTime);
  const endAt = addMinutes(startAt, durationMinutes);
  const now = new Date();
  const walkUp = formData.get("walkUp") === "1";

  if (endAt <= now) {
    return { error: "Choose a duration that ends in the future." };
  }

  if (durationMinutes % instrument.slotMinutes !== 0) {
    return { error: `Duration must be in ${instrument.slotMinutes}-minute increments.` };
  }

  const startMinutes = parseClock(startTime);
  if (!isOnBookingGrid(startMinutes, BOOKING_GRID_MINUTES)) {
    return { error: `Start time must be on a ${BOOKING_GRID_MINUTES}-minute interval (e.g. 9:00, 9:15, 9:45).` };
  }

  if (walkUp) {
    const currentBlock = nowBlockStart(parseClock(clockTime(now)), BOOKING_GRID_MINUTES);
    if (startMinutes < currentBlock) {
      return { error: "That walk-up slot has passed. Choose a later time." };
    }
  } else if (startAt < now) {
    return { error: "Start time is in the past. Refresh the page for current slots." };
  }

  if (
    !walkUp &&
    instrument.minNoticeMinutes > 0 &&
    startAt < addMinutes(now, instrument.minNoticeMinutes)
  ) {
    return {
      error: `Bookings need at least ${formatHours(instrument.minNoticeMinutes)} notice.`,
    };
  }

  if (durationMinutes > instrument.maxSessionMinutes) {
    return { error: `Maximum session length is ${formatHours(instrument.maxSessionMinutes)}.` };
  }
  const maxFuture = addMinutes(now, instrument.advanceBookingDays * 24 * 60);
  if (startAt > maxFuture) {
    return { error: `Bookings can be made up to ${instrument.advanceBookingDays} days in advance.` };
  }

  // Training gate
  const isTrained =
    user.role === "ADMIN" ||
    !!(await prisma.instrumentTraining.findUnique({
      where: { userId_instrumentId: { userId: user.id, instrumentId } },
    }));
  if (!isTrained) {
    return { error: "You are not yet trained on this instrument. Contact a lab administrator." };
  }

  // Weekly split-limit check (standard hours)
  const sh = parseStandardHours(instrument.standardHours);
  const limitOverride = await getUserInstrumentLimitOverride(user.id, instrumentId);
  const limit = effectiveStandardLimit(user, instrument, limitOverride);
  if (limit !== null) {
    const usage = await weeklyUsage(user.id, instrumentId, startAt, sh);
    const newStandard = standardOverlapMinutes(startAt, endAt, sh);
    if (usage.standardMinutes + newStandard > limit) {
      const remaining = Math.max(0, limit - usage.standardMinutes);
      return {
        error:
          newStandard === 0
            ? "Weekly limit reached for standard hours."
            : `This exceeds your weekly standard-hours limit. You have ${formatHours(remaining)} of ${formatHours(limit)} remaining this week. After-hours time is unlimited.`,
      };
    }
  }

  const needsApproval = requiresApproval(user, instrument, isTrained, limitOverride);
  const status = needsApproval ? "PENDING" : "CONFIRMED";

  // Conflict check + create. The DB exclusion constraint is the source of truth;
  // we also pre-check to return a friendly message in the common case.
  const overlap = await prisma.booking.findFirst({
    where: {
      instrumentId,
      status: { in: ["CONFIRMED", "PENDING"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlap) {
    return { error: "That time was just taken. Please choose another slot." };
  }

  let booking;
  try {
    booking = await prisma.booking.create({
      data: { instrumentId, userId: user.id, startAt, endAt, notes, status },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError ||
      (err as { message?: string })?.message?.includes("Booking_no_overlap")
    ) {
      return { error: "That time was just taken. Please choose another slot." };
    }
    throw err;
  }

  await audit(user.id, "booking.create", { type: "booking", id: booking.id }, { status });

  if (user.notifyConfirmations) {
    await sendEmail({
      to: user.email,
      subject: needsApproval ? "Booking submitted (awaiting approval)" : "Booking confirmed",
      heading: needsApproval ? "Booking awaiting approval" : "Booking confirmed",
      body: `<p><strong>${instrument.name}</strong></p><p>${formatTz(startAt, "EEE MMM d, yyyy")} · ${formatTz(startAt, "h:mm a")} – ${formatTz(endAt, "h:mm a")}</p>${needsApproval ? "<p>An administrator will review your request.</p>" : ""}`,
      cta: { label: "View my bookings", href: `${APP_URL}/bookings` },
    });
  }

  revalidatePath("/calendar");
  revalidatePath("/bookings");
  revalidatePath("/");
  return {
    success: needsApproval
      ? "Booking submitted. An administrator will review it shortly."
      : "Booking confirmed.",
  };
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bookingId = String(formData.get("bookingId"));

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { instrument: true, user: true, session: true },
  });
  if (!booking) return;

  const isOwner = booking.userId === user.id;
  const isAdmin = user.role === "ADMIN";
  if (!isOwner && !isAdmin) return;
  if (booking.status === "CANCELLED" || booking.status === "REJECTED") return;

  const now = new Date();
  if (booking.endAt <= now) return;
  if (booking.session && !booking.session.signedOutAt) return;

  await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
  await audit(user.id, "booking.cancel", { type: "booking", id: bookingId }, { byAdmin: isAdmin && !isOwner });

  if (booking.user.notifyConfirmations) {
    await sendEmail({
      to: booking.user.email,
      subject: "Booking cancelled",
      heading: "Booking cancelled",
      body: `<p>Your booking for <strong>${booking.instrument.name}</strong> on ${formatTz(booking.startAt, "EEE MMM d, h:mm a")} was cancelled${isAdmin && !isOwner ? " by an administrator" : ""}.</p>`,
    });
  }

  // Offer the freed slot to the first person on the waitlist.
  await notifyNextOnWaitlist(booking.instrumentId, booking.startAt, booking.endAt);

  revalidatePath("/calendar");
  revalidatePath("/bookings");
  revalidatePath("/admin/bookings");
  revalidatePath("/");
}
