/**
 * Clears operational booking data (bookings, sessions, laser readings, waitlist).
 * Keeps users, instruments, training, and lab settings.
 *
 * Usage:
 *   npm run db:clear-bookings
 *   npm run db:clear-bookings -- --audit   (also remove booking/session/waitlist audit rows)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const clearAudit = process.argv.includes("--audit");

async function main() {
  const [bookings, sessions, waitlist] = await Promise.all([
    prisma.booking.count(),
    prisma.instrumentSession.count(),
    prisma.waitlistEntry.count(),
  ]);

  console.log(`Found ${bookings} booking(s), ${sessions} session(s), ${waitlist} waitlist entry(ies).`);

  // Sessions + laser readings cascade from bookings; delete bookings first.
  const deletedBookings = await prisma.booking.deleteMany();
  const deletedWaitlist = await prisma.waitlistEntry.deleteMany();

  let deletedAudit = 0;
  if (clearAudit) {
    const res = await prisma.auditEvent.deleteMany({
      where: {
        action: {
          in: [
            "booking.create",
            "booking.cancel",
            "booking.approve",
            "booking.reject",
            "session.sign_in",
            "session.sign_out",
            "waitlist.join",
          ],
        },
      },
    });
    deletedAudit = res.count;
  }

  console.log(`Deleted ${deletedBookings.count} booking(s) (sessions/readings included).`);
  console.log(`Deleted ${deletedWaitlist.count} waitlist entry(ies).`);
  if (clearAudit) {
    console.log(`Deleted ${deletedAudit} audit event(s).`);
  } else {
    console.log("Audit log kept (booking/session rows remain with orphaned target IDs).");
    console.log("Re-run with --audit to remove those audit entries too.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
