"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { APP_URL } from "@/lib/env";
import { createBookingSchema, extendBookingSchema } from "@/lib/validation";
import {
  resolveBookingExtension,
  resolveExtensionRequest,
  validateBookingExtension,
  validateExtensionRequest,
} from "@/lib/booking-extension";
import { notifyAdminsOfBookingRequest, notifyAdminsOfRequestCancelled } from "@/lib/admin-notify";
import { addMinutes, formatTz, formatBookingEnd, formatBookingRange, localToUtc, clockTime, parseClock } from "@/lib/time";
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
  violatesUserBookingGap,
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
    targetUserId: formData.get("targetUserId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid booking." };
  const { instrumentId, date, startTime, durationMinutes, notes, targetUserId } = parsed.data;

  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return { error: "Instrument not found." };
  if (instrument.maintenance) return { error: "This instrument is under maintenance and cannot be booked." };

  const isAdmin = user.role === "ADMIN";
  const isTrained =
    isAdmin ||
    !!(await prisma.instrumentTraining.findUnique({
      where: { userId_instrumentId: { userId: user.id, instrumentId } },
    }));

  const walkUp = formData.get("walkUp") === "1";
  const memberRequest = instrument.bookingAdminMode && !isAdmin;
  let bookForUserId = user.id;
  let bookForUser = user;

  if (instrument.bookingAdminMode) {
    if (isAdmin) {
      if (walkUp) {
        return { error: "Use the booking form to schedule in advance for a user." };
      }
      if (!targetUserId) return { error: "Select a user for this booking." };
      bookForUserId = targetUserId;
      if (targetUserId !== user.id) {
        const u = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!u || u.status !== "ACTIVE") return { error: "Selected user is not active." };
        bookForUser = u;
      }
    } else {
      if (walkUp) {
        return { error: "Submit a time request using the calendar form." };
      }
      if (!isTrained) {
        return { error: "You are not yet trained on this instrument. Contact a lab administrator." };
      }
    }
  } else if (targetUserId) {
    return { error: "Invalid booking request." };
  }

  const startAt = localToUtc(date, startTime);
  const endAt = addMinutes(startAt, durationMinutes);
  const now = new Date();

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

  if (walkUp && !memberRequest) {
    const currentBlock = nowBlockStart(parseClock(clockTime(now)), BOOKING_GRID_MINUTES);
    if (startMinutes < currentBlock) {
      return { error: "That walk-up slot has passed. Refresh the page." };
    }
  } else if (startAt < now) {
    return { error: "Start time is in the past. Refresh the page for current slots." };
  }

  if (
    !walkUp &&
    !instrument.bookingAdminMode &&
    instrument.minNoticeMinutes > 0 &&
    startAt < addMinutes(now, instrument.minNoticeMinutes)
  ) {
    return {
      error: `Bookings need at least ${formatHours(instrument.minNoticeMinutes)} notice.`,
    };
  }

  if (memberRequest) {
    // No max session cap on member time requests.
  } else if (durationMinutes > instrument.maxSessionMinutes) {
    return { error: `Maximum session length is ${formatHours(instrument.maxSessionMinutes)}.` };
  }
  const maxFuture = addMinutes(now, instrument.advanceBookingDays * 24 * 60);
  if (startAt > maxFuture) {
    return { error: `Bookings can be made up to ${instrument.advanceBookingDays} days in advance.` };
  }

  // Training gate (normal mode only; admin-mode members checked above)
  if (!instrument.bookingAdminMode && !isTrained) {
    return { error: "You are not yet trained on this instrument. Contact a lab administrator." };
  }

  // Weekly split-limit check (standard hours)
  const sh = parseStandardHours(instrument.standardHours);
  const limitOverride = await getUserInstrumentLimitOverride(bookForUser.id, instrumentId);
  const limit = effectiveStandardLimit(bookForUser, instrument, limitOverride);
  if (limit !== null) {
    const usage = await weeklyUsage(bookForUser.id, instrumentId, startAt, sh);
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

  const needsApproval = memberRequest
    ? true
    : !instrument.bookingAdminMode && requiresApproval(bookForUser, instrument, isTrained, limitOverride);
  const status = needsApproval ? "PENDING" : "CONFIRMED";

  const overlapStatuses: ("CONFIRMED" | "PENDING")[] = memberRequest ? ["CONFIRMED"] : ["CONFIRMED", "PENDING"];
  const overlap = await prisma.booking.findFirst({
    where: {
      instrumentId,
      status: { in: overlapStatuses },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlap) {
    return { error: "That time was just taken. Please choose another slot." };
  }

  if (instrument.minGapBetweenUserBookingsMinutes > 0) {
    const myBookings = await prisma.booking.findMany({
      where: {
        userId: bookForUser.id,
        instrumentId,
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      select: { startAt: true, endAt: true },
    });
    if (violatesUserBookingGap(startAt, endAt, myBookings, instrument.minGapBetweenUserBookingsMinutes)) {
      return {
        error: `Your bookings on this instrument must be at least ${formatHours(instrument.minGapBetweenUserBookingsMinutes)} apart.`,
      };
    }
  }

  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        instrumentId,
        userId: bookForUser.id,
        startAt,
        endAt,
        scheduledEndAt: endAt,
        notes,
        status,
      },
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

  await audit(user.id, "booking.create", { type: "booking", id: booking.id }, {
    status,
    ...(instrument.bookingAdminMode ? { bookedForUserId: bookForUser.id } : {}),
  });

  if (needsApproval && memberRequest) {
    await notifyAdminsOfBookingRequest({
      kind: "new",
      user: bookForUser,
      instrument,
      startAt,
      endAt,
    });
  } else if (needsApproval && bookForUser.notifyConfirmations) {
    await sendEmail({
      to: bookForUser.email,
      subject: "Booking submitted (awaiting approval)",
      heading: "Booking awaiting approval",
      body: `<p><strong>${instrument.name}</strong></p><p>${formatBookingRange(startAt, endAt, "EEE MMM d, h:mm a")}</p><p>An administrator will review your request.</p>`,
      cta: { label: "View my bookings", href: `${APP_URL}/bookings` },
    });
  }

  revalidatePath("/calendar");
  revalidatePath("/bookings");
  revalidatePath("/admin/bookings");
  revalidatePath("/");
  return {
    success: memberRequest
      ? "Request submitted. An administrator will review it."
      : instrument.bookingAdminMode
        ? "Booking created for the selected user."
        : needsApproval
          ? "Booking submitted. An administrator will review it shortly."
          : "Booking confirmed.",
  };
}

export async function extendBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") return { error: "Your account is not active." };

  const parsed = extendBookingSchema.safeParse({
    bookingId: formData.get("bookingId"),
    newEndAt: formData.get("newEndAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid extension." };
  const { bookingId, newEndAt: newEndAtIso } = parsed.data;
  const newEndAt = new Date(newEndAtIso);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { instrument: true, session: { select: { signedOutAt: true } } },
  });
  if (!booking) return { error: "Booking not found." };
  if (!booking.instrument.bookingAdminMode) {
    return { error: "Extensions are only available in booking admin mode." };
  }

  const isAdmin = user.role === "ADMIN";
  if (booking.userId !== user.id && !isAdmin) {
    return { error: "You can only extend your own bookings." };
  }

  if (!isAdmin) {
    const info = await resolveExtensionRequest(booking, booking.instrument, new Date());
    if (!info.canExtend) {
      return { error: info.reason ?? "You cannot request an extension right now." };
    }
    if (!info.options.some((o) => new Date(o.newEndAtIso).getTime() === newEndAt.getTime())) {
      return { error: "Choose a valid extension from the list." };
    }

    const validation = await validateExtensionRequest(
      booking,
      booking.instrument,
      newEndAt,
    );
    if (!validation.ok) return { error: validation.error };

    await prisma.booking.update({
      where: { id: bookingId },
      data: { requestedEndAt: newEndAt },
    });
    await audit(user.id, "booking.extend_request", { type: "booking", id: bookingId }, {
      requestedEndAt: newEndAt.toISOString(),
    });

    await notifyAdminsOfBookingRequest({
      kind: "extension",
      user,
      instrument: booking.instrument,
      startAt: booking.startAt,
      endAt: booking.endAt,
      requestedEndAt: newEndAt,
    });

    revalidatePath("/calendar");
    revalidatePath("/bookings");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    return {
      success: `Extension request submitted (until ${formatBookingEnd(booking.startAt, newEndAt)}). An administrator will review it.`,
    };
  }

  const info = await resolveBookingExtension(booking, booking.instrument, user.id, isAdmin);
  if (!info.canExtend) {
    return { error: info.reason ?? "This booking cannot be extended right now." };
  }
  if (!info.options.some((o) => new Date(o.newEndAtIso).getTime() === newEndAt.getTime())) {
    return { error: "Choose a valid extension from the list." };
  }

  const validation = await validateBookingExtension(
    booking,
    booking.instrument,
    booking.userId,
    newEndAt,
  );
  if (!validation.ok) return { error: validation.error };

  await prisma.booking.update({
    where: { id: bookingId },
    data: { endAt: newEndAt, scheduledEndAt: newEndAt },
  });
  await audit(user.id, "booking.extend", { type: "booking", id: bookingId }, {
    newEndAt: newEndAt.toISOString(),
    byAdmin: isAdmin && booking.userId !== user.id,
  });

  revalidatePath("/calendar");
  revalidatePath("/bookings");
  revalidatePath("/admin/bookings");
  revalidatePath("/");
  return { success: `Booking extended until ${formatBookingEnd(booking.startAt, newEndAt)}.` };
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

  const wasPending = booking.status === "PENDING";

  await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
  await audit(user.id, "booking.cancel", { type: "booking", id: bookingId }, { byAdmin: isAdmin && !isOwner });

  if (wasPending && booking.instrument.bookingAdminMode && isOwner && !isAdmin) {
    await notifyAdminsOfRequestCancelled({
      kind: "booking",
      user: booking.user,
      instrument: booking.instrument,
      startAt: booking.startAt,
      endAt: booking.endAt,
      requestedEndAt: booking.requestedEndAt ?? undefined,
    });
  } else if (!wasPending) {
    // Offer the freed slot to the first person on the waitlist.
    await notifyNextOnWaitlist(booking.instrumentId, booking.startAt, booking.endAt);
  }

  revalidatePath("/calendar");
  revalidatePath("/bookings");
  revalidatePath("/admin/bookings");
  revalidatePath("/");
}

export async function cancelExtensionRequestAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bookingId = String(formData.get("bookingId"));

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { instrument: true, user: true },
  });
  if (!booking || booking.userId !== user.id || !booking.requestedEndAt) return;
  if (booking.status !== "CONFIRMED") return;

  const requestedEndAt = booking.requestedEndAt;
  await prisma.booking.update({ where: { id: bookingId }, data: { requestedEndAt: null } });
  await audit(user.id, "booking.extend_request_cancel", { type: "booking", id: bookingId }, {
    requestedEndAt: requestedEndAt.toISOString(),
  });

  await notifyAdminsOfRequestCancelled({
    kind: "extension",
    user: booking.user,
    instrument: booking.instrument,
    startAt: booking.startAt,
    endAt: booking.endAt,
    requestedEndAt,
  });

  revalidatePath("/calendar");
  revalidatePath("/bookings");
  revalidatePath("/admin/bookings");
  revalidatePath("/");
}
