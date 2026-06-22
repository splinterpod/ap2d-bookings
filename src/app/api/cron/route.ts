import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { CRON_SECRET, APP_URL } from "@/lib/env";
import { formatTz, addMinutes } from "@/lib/time";
import {
  autoSignOutExpiredSessions,
  flagPastNoShows,
  processSessionRemindersAndNoShows,
} from "@/lib/session-lifecycle";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  return header === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const result = {
    reminders1: 0,
    lateSignInReminders: 0,
    noShowCancellations: 0,
    sessionsAutoSignedOut: 0,
    autoSignOutEmails: 0,
    noShowsFlagged: 0,
    guestsDeactivated: 0,
    waitlistExpired: 0,
  };

  // 1-hour reminders
  const due1 = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder1Sent: false,
      startAt: { gt: now, lte: addMinutes(now, 60) },
    },
    include: { user: true, instrument: true },
  });
  for (const b of due1) {
    if (b.user.notifyReminders) {
      await sendEmail({
        to: b.user.email,
        subject: "Your Raman session starts soon",
        heading: "Starting soon",
        body: `<p>Your session on <strong>${b.instrument.name}</strong> starts at ${formatTz(b.startAt, "h:mm a")}. Remember to sign in when you arrive.</p>`,
        cta: { label: "Sign in to session", href: `${APP_URL}/bookings` },
      });
    }
    await prisma.booking.update({ where: { id: b.id }, data: { reminder1Sent: true } });
    result.reminders1++;
  }

  const sessionCron = await processSessionRemindersAndNoShows(now);
  result.lateSignInReminders = sessionCron.lateSignInReminders;
  result.noShowCancellations = sessionCron.noShowCancellations;

  const autoSignOut = await autoSignOutExpiredSessions(now);
  result.sessionsAutoSignedOut = autoSignOut.count;
  result.autoSignOutEmails = autoSignOut.emailsSent;

  result.noShowsFlagged = await flagPastNoShows(now);

  // Guest expiry.
  const expiredGuests = await prisma.user.findMany({
    where: { role: "GUEST", status: "ACTIVE", guestExpiresAt: { lt: now } },
    select: { id: true },
  });
  if (expiredGuests.length) {
    const ids = expiredGuests.map((u) => u.id);
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: "DEACTIVATED" } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    result.guestsDeactivated = ids.length;
  }

  // Expire stale waitlist holds.
  const expiredHolds = await prisma.waitlistEntry.updateMany({
    where: { status: "NOTIFIED", holdExpiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  result.waitlistExpired = expiredHolds.count;

  // Housekeeping: drop expired auth sessions and used/expired reset tokens.
  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });

  return Response.json({ ok: true, ...result });
}
