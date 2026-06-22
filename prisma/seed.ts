import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Lab settings singleton
  await prisma.labSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, timezone: process.env.APP_TIMEZONE ?? "America/Toronto", labName: "Kherani Lab" },
  });

  // Raman Spectrometer (pilot instrument)
  await prisma.instrument.upsert({
    where: { slug: "raman" },
    update: {},
    create: {
      name: "Raman Spectrometer",
      slug: "raman",
      location: "TBEP — 661 University Avenue, 14th Floor, Toronto, ON",
      description: "Shared Raman spectrometer. Lasers: 532 nm, 633 nm, 785 nm.",
      instrumentType: "raman",
      slotMinutes: 15,
      maxSessionMinutes: 240,
      advanceBookingDays: 14,
      minNoticeMinutes: 0,
      cancellationCutoffMinutes: 0,
      standardHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
      standardHoursWeeklyLimitMinutes: 12 * 60, // 12h/week during standard hours
      afterHoursWeeklyLimitMinutes: null, // unlimited after hours
      defaultRequiresApproval: false,
      autoConfirmIfTrained: true,
    },
  });

  // First admin bootstrap
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "1auqilsha@gmail.com").toLowerCase();
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN", status: "ACTIVE" },
      create: {
        email: adminEmail,
        username: adminUsername,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`Seeded admin: ${adminEmail} (username: ${adminUsername}). Change the password after first login.`);
  } else {
    console.log("Admin already exists; skipping admin seed.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
