/**
 * Production pilot reset: wipe bookings, sessions, waitlist, audit log, and all users
 * except the account owner. Keeps instruments and lab settings.
 *
 * Usage (Neon):
 *   set DATABASE_URL to your Neon URL, then:
 *   npm run db:reset-pilot
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ownerEmail = (process.env.ACCOUNT_OWNER_EMAIL ?? "1auqilsha@gmail.com").trim().toLowerCase();

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    throw new Error(`Owner account not found (${ownerEmail}). Aborting — no users deleted.`);
  }

  const [userCount, bookingCount, waitlistCount, auditCount, sessionCount] = await Promise.all([
    prisma.user.count(),
    prisma.booking.count(),
    prisma.waitlistEntry.count(),
    prisma.auditEvent.count(),
    prisma.instrumentSession.count(),
  ]);

  console.log("Current counts:");
  console.log(`  Users: ${userCount}`);
  console.log(`  Bookings: ${bookingCount}`);
  console.log(`  Sessions: ${sessionCount}`);
  console.log(`  Waitlist: ${waitlistCount}`);
  console.log(`  Audit events: ${auditCount}`);
  console.log(`  Owner to keep: ${ownerEmail} (${owner.username})`);
  console.log("");

  await prisma.booking.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.passwordResetToken.deleteMany();

  const deletedUsers = await prisma.user.deleteMany({
    where: { email: { not: ownerEmail } },
  });

  await prisma.user.update({
    where: { email: ownerEmail },
    data: { status: "ACTIVE", role: "ADMIN", guestExpiresAt: null },
  });

  console.log(`Done. Deleted ${deletedUsers.count} user(s).`);
  console.log(`Owner ${ownerEmail} kept as ACTIVE admin.`);
  console.log("Instruments and lab settings unchanged.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
