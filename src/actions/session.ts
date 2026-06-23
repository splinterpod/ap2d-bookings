"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addMinutes, formatTz } from "@/lib/time";
import {
  deriveLaserFlags,
  readLaserSessionReadings,
  validateLaserSessionForm,
} from "@/lib/laser-session";
import { autoSignOutExpiredSessions } from "@/lib/session-lifecycle";
import { notifyNextOnWaitlist } from "./waitlist";

export type FormState = { error?: string; success?: string } | undefined;

const EARLY_SIGNIN_BUFFER_MIN = 15;
const SESSION_NOTES_MAX = 500;

function parseSessionNotes(formData: FormData): string | null {
  const raw = String(formData.get("sessionNotes") || "").trim();
  if (!raw) return null;
  return raw.slice(0, SESSION_NOTES_MAX);
}

export async function signInSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") return { error: "Your account is not active." };

  const bookingId = String(formData.get("bookingId"));

  if (formData.get("skip") === "true") {
    return { error: "Laser details are required to sign in." };
  }

  const validationError = validateLaserSessionForm(formData, false);
  if (validationError) return { error: validationError };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: true },
  });
  if (!booking || booking.userId !== user.id) return { error: "Booking not found." };
  if (booking.status !== "CONFIRMED") return { error: "This booking is not confirmed." };
  if (booking.session) return { error: "You are already signed in for this session." };

  const now = new Date();
  if (now < addMinutes(booking.startAt, -EARLY_SIGNIN_BUFFER_MIN)) {
    return { error: "You can sign in starting 15 minutes before your booked time." };
  }
  if (now > booking.endAt) {
    return { error: "This booking has ended." };
  }

  await autoSignOutExpiredSessions(now);

  const blockingSession = await prisma.instrumentSession.findFirst({
    where: {
      signedOutAt: null,
      booking: {
        instrumentId: booking.instrumentId,
        userId: { not: user.id },
        endAt: { gt: now },
      },
    },
    include: { booking: true },
  });
  if (blockingSession) {
    return {
      error: `The instrument is still in use until ${formatTz(blockingSession.booking.endAt, "h:mm a")}. Sign in when the previous session ends.`,
    };
  }

  const readings = readLaserSessionReadings(formData, "SIGN_IN");
  const { laserTurnedOn, laserAlreadyOn } = deriveLaserFlags(readings);
  const notes = parseSessionNotes(formData);

  await prisma.instrumentSession.create({
    data: {
      bookingId: booking.id,
      userId: user.id,
      signedInAt: now,
      laserTurnedOn,
      laserAlreadyOn,
      signInSkipped: false,
      notes,
      readings: { create: readings },
    },
  });
  await audit(user.id, "session.sign_in", { type: "booking", id: booking.id }, {});

  revalidatePath("/bookings");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: "Signed in. Enjoy your session." };
}

export async function signOutSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const bookingId = String(formData.get("bookingId"));

  const validationError = validateLaserSessionForm(formData, false);
  if (validationError) return { error: validationError };

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { session: true },
  });
  if (!booking || booking.userId !== user.id) return { error: "Booking not found." };
  if (!booking.session) return { error: "No active session to sign out of." };
  if (booking.session.signedOutAt) return { error: "You have already signed out." };

  const now = new Date();
  await autoSignOutExpiredSessions(now);

  const readings = readLaserSessionReadings(formData, "SIGN_OUT");
  const { laserTurnedOn, laserAlreadyOn } = deriveLaserFlags(readings);
  const notes = parseSessionNotes(formData);
  const scheduledEnd = booking.scheduledEndAt;
  const freedSlot = now < scheduledEnd;

  await prisma.$transaction(async (tx) => {
    await tx.sessionLaserReading.deleteMany({ where: { sessionId: booking.session!.id } });

    await tx.instrumentSession.update({
      where: { id: booking.session!.id },
      data: {
        signedOutAt: now,
        actualEndAt: now,
        signOutSkipped: false,
        notes,
        laserTurnedOn,
        laserAlreadyOn,
        readings: { create: readings },
      },
    });

    if (freedSlot) {
      await tx.booking.update({ where: { id: booking.id }, data: { endAt: now } });
    }
  });

  await audit(user.id, "session.sign_out", { type: "booking", id: booking.id }, {
    releasedEarly: freedSlot,
  });

  if (freedSlot) {
    await notifyNextOnWaitlist(booking.instrumentId, now, scheduledEnd);
  }

  revalidatePath("/bookings");
  revalidatePath("/calendar");
  revalidatePath("/");
  return { success: "Signed out. Thank you." };
}
