import "server-only";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { APP_URL } from "./env";
import { formatTz, addMinutes } from "./time";
import { notifyNextOnWaitlist } from "@/actions/waitlist";

export type AutoSignOutResult = {
  count: number;
  emailsSent: number;
};

/** Close open sessions whose booked time has ended (signed out at booking end). */
export async function autoSignOutExpiredSessions(now = new Date()): Promise<AutoSignOutResult> {
  const expired = await prisma.instrumentSession.findMany({
    where: {
      signedOutAt: null,
      booking: { endAt: { lte: now } },
    },
    include: {
      booking: {
        include: { user: true, instrument: { select: { name: true, slug: true } } },
      },
    },
  });

  if (expired.length === 0) return { count: 0, emailsSent: 0 };

  let emailsSent = 0;

  await prisma.$transaction(
    expired.map((s) =>
      prisma.instrumentSession.update({
        where: { id: s.id },
        data: {
          signedOutAt: s.booking.endAt,
          actualEndAt: s.booking.endAt,
        },
      }),
    ),
  );

  for (const s of expired) {
    const b = s.booking;
    if (b.autoSignedOutNotified) continue;
    await prisma.booking.update({
      where: { id: b.id },
      data: { autoSignedOutNotified: true },
    });
    if (b.user.notifyReminders) {
      await sendEmail({
        to: b.user.email,
        subject: `Session ended — ${b.instrument.name}`,
        heading: "Automatically signed out",
        body: `<p>Your booked session on <strong>${b.instrument.name}</strong> ended at ${formatTz(b.endAt, "h:mm a")} and you were automatically signed out.</p><p>If you are still using the instrument, contact a lab administrator.</p>`,
        cta: { label: "View my bookings", href: `${APP_URL}/bookings` },
      });
      emailsSent++;
    }
  }

  return { count: expired.length, emailsSent };
}

export type SessionCronResult = {
  lateSignInReminders: number;
  noShowCancellations: number;
};

/** Remind users who haven't signed in; cancel no-shows after instrument-configured grace period. */
export async function processSessionRemindersAndNoShows(now = new Date()): Promise<SessionCronResult> {
  let lateSignInReminders = 0;
  let noShowCancellations = 0;

  const instruments = await prisma.instrument.findMany({
    select: { id: true, name: true, lateSignInReminderMinutes: true, noShowCancelMinutes: true },
  });

  for (const inst of instruments) {
    // Late sign-in reminder: past start + threshold, still no session, booking not ended.
    const lateThreshold = addMinutes(now, -inst.lateSignInReminderMinutes);
    const lateBookings = await prisma.booking.findMany({
      where: {
        instrumentId: inst.id,
        status: "CONFIRMED",
        lateSignInReminderSent: false,
        startAt: { lte: lateThreshold },
        endAt: { gt: now },
        session: { is: null },
      },
      include: { user: true, instrument: { select: { name: true, slug: true } } },
    });

    for (const b of lateBookings) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { lateSignInReminderSent: true },
      });
      if (b.user.notifyReminders) {
        await sendEmail({
          to: b.user.email,
          subject: `Sign in — ${b.instrument.name} session started`,
          heading: "Your session has started",
          body: `<p>Your booking on <strong>${b.instrument.name}</strong> started at ${formatTz(b.startAt, "h:mm a")} but you have not signed in yet.</p><p>Please sign in on the bookings page when you arrive.</p>`,
          cta: { label: "Sign in now", href: `${APP_URL}/bookings` },
        });
      }
      lateSignInReminders++;
    }

    // No-show auto-cancel: past start + noShowCancelMinutes, no session.
    const noShowThreshold = addMinutes(now, -inst.noShowCancelMinutes);
    const noShows = await prisma.booking.findMany({
      where: {
        instrumentId: inst.id,
        status: "CONFIRMED",
        startAt: { lte: noShowThreshold },
        endAt: { gt: now },
        session: { is: null },
      },
      include: { user: true, instrument: { select: { name: true, slug: true } } },
    });

    for (const b of noShows) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: "CANCELLED", noShow: true },
      });
      await notifyNextOnWaitlist(b.instrumentId, b.startAt, b.endAt);
      if (b.user.notifyConfirmations) {
        await sendEmail({
          to: b.user.email,
          subject: `Booking cancelled — no sign-in — ${b.instrument.name}`,
          heading: "Booking cancelled (no sign-in)",
          body: `<p>Your booking on <strong>${b.instrument.name}</strong> (${formatTz(b.startAt, "EEE MMM d, h:mm a")} – ${formatTz(b.endAt, "h:mm a")}) was automatically cancelled because you did not sign in within ${inst.noShowCancelMinutes} minutes of the start time.</p>`,
          cta: { label: "Book again", href: `${APP_URL}/calendar?instrument=${b.instrument.slug}` },
        });
      }
      noShowCancellations++;
    }
  }

  return { lateSignInReminders, noShowCancellations };
}

/** Flag ended bookings that never had a session (after the slot fully passed). */
export async function flagPastNoShows(now = new Date()): Promise<number> {
  const noShows = await prisma.booking.findMany({
    where: { status: "CONFIRMED", noShow: false, endAt: { lt: now }, session: { is: null } },
    select: { id: true },
  });
  if (noShows.length === 0) return 0;
  await prisma.booking.updateMany({
    where: { id: { in: noShows.map((b) => b.id) } },
    data: { noShow: true },
  });
  return noShows.length;
}
