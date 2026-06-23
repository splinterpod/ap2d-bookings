/**
 * Inserts realistic test bookings and measures Postgres storage delta.
 * Usage: node --env-file=.env ./node_modules/tsx/dist/cli.mjs prisma/measure-booking-storage.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BOOKING_COUNT = 50;
const TEST_EMAIL = "storage-test@local.dev";
const WAVELENGTHS = [532, 633, 785] as const;

type TableSize = { table: string; totalBytes: number; rowEstimate: number | null };

async function tableSizes(): Promise<TableSize[]> {
  const rows = await prisma.$queryRaw<
    Array<{ table: string; total_bytes: bigint; row_estimate: bigint | null }>
  >`
    SELECT
      c.relname AS table,
      pg_total_relation_size(c.oid)::bigint AS total_bytes,
      c.reltuples::bigint AS row_estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY total_bytes DESC
  `;
  return rows.map((r) => ({
    table: r.table,
    totalBytes: Number(r.total_bytes),
    rowEstimate: r.row_estimate != null ? Number(r.row_estimate) : null,
  }));
}

async function databaseBytes(): Promise<number> {
  const [{ size }] = await prisma.$queryRaw<Array<{ size: bigint }>>`
    SELECT pg_database_size(current_database())::bigint AS size
  `;
  return Number(size);
}

function pretty(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sumTables(sizes: TableSize[], names: string[]): number {
  const set = new Set(names);
  return sizes.filter((t) => set.has(t.table)).reduce((n, t) => n + t.totalBytes, 0);
}

async function createTestBookings(userId: string, instrumentId: string) {
  const base = new Date("2026-01-15T14:00:00.000Z");
  for (let i = 0; i < BOOKING_COUNT; i++) {
    const startAt = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const signedInAt = new Date(startAt.getTime() + 5 * 60 * 1000);
    const signedOutAt = new Date(endAt.getTime() - 10 * 60 * 1000);

    const booking = await prisma.booking.create({
      data: {
        instrumentId,
        userId,
        startAt,
        endAt,
        scheduledEndAt: endAt,
        status: "CONFIRMED",
        notes: `Test booking #${i + 1} — sample notes for storage measurement.`,
        reminder1Sent: true,
        session: {
          create: {
            userId,
            signedInAt,
            signedOutAt,
            actualEndAt: signedOutAt,
            laserTurnedOn: true,
            laserAlreadyOn: false,
            notes: "Session notes: calibrated 532 nm, ran standard sample.",
            readings: {
              create: [
                ...WAVELENGTHS.map((wavelengthNm) => ({
                  wavelengthNm,
                  calibrated: true,
                  photonCount: 12345.67 + wavelengthNm,
                  phase: "SIGN_IN" as const,
                })),
                ...WAVELENGTHS.map((wavelengthNm) => ({
                  wavelengthNm,
                  calibrated: true,
                  photonCount: 9876.54 + wavelengthNm,
                  phase: "SIGN_OUT" as const,
                })),
              ],
            },
          },
        },
      },
    });

    await prisma.auditEvent.createMany({
      data: [
        {
          actorId: userId,
          action: "booking.create",
          targetType: "booking",
          targetId: booking.id,
          metadata: { status: "CONFIRMED" },
        },
        {
          actorId: userId,
          action: "session.sign_in",
          targetType: "booking",
          targetId: booking.id,
        },
        {
          actorId: userId,
          action: "session.sign_out",
          targetType: "booking",
          targetId: booking.id,
          metadata: { skipped: false, release: false },
        },
      ],
    });
  }
}

async function main() {
  await prisma.$executeRaw`ANALYZE`;

  const beforeDb = await databaseBytes();
  const beforeTables = await tableSizes();
  const bookingTables = ["Booking", "InstrumentSession", "SessionLaserReading", "AuditEvent"];

  const instrument = await prisma.instrument.findFirst({ where: { slug: "raman" } });
  if (!instrument) throw new Error("Run npm run db:seed first (raman instrument missing).");

  let testUser = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        username: "storage_test",
        passwordHash: await bcrypt.hash("test-only", 12),
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
  }

  const beforeBookingRows = await prisma.booking.count();
  const beforeSessionRows = await prisma.instrumentSession.count();
  const beforeReadingRows = await prisma.sessionLaserReading.count();
  const beforeAuditRows = await prisma.auditEvent.count();

  console.log(`\n=== Baseline (${beforeBookingRows} bookings in DB) ===`);
  console.log(`Database total: ${pretty(beforeDb)}`);
  console.log(`Booking-related tables: ${pretty(sumTables(beforeTables, bookingTables))}`);

  console.log(`\nInserting ${BOOKING_COUNT} realistic bookings (session + 6 laser readings + 3 audit rows each)...`);
  await createTestBookings(testUser.id, instrument.id);
  await prisma.$executeRaw`ANALYZE`;

  const afterDb = await databaseBytes();
  const afterTables = await tableSizes();

  const afterBookingRows = await prisma.booking.count();
  const afterSessionRows = await prisma.instrumentSession.count();
  const afterReadingRows = await prisma.sessionLaserReading.count();
  const afterAuditRows = await prisma.auditEvent.count();

  const dbDelta = afterDb - beforeDb;
  const bookingDelta = sumTables(afterTables, bookingTables) - sumTables(beforeTables, bookingTables);

  console.log(`\n=== After insert ===`);
  console.log(`Rows added:`);
  console.log(`  Booking:              +${afterBookingRows - beforeBookingRows}`);
  console.log(`  InstrumentSession:    +${afterSessionRows - beforeSessionRows}`);
  console.log(`  SessionLaserReading:  +${afterReadingRows - beforeReadingRows}`);
  console.log(`  AuditEvent:           +${afterAuditRows - beforeAuditRows}`);

  console.log(`\nStorage delta (includes indexes):`);
  console.log(`  Whole database:       +${pretty(dbDelta)}`);
  console.log(`  Booking-related:      +${pretty(bookingDelta)}`);
  console.log(`  Per booking (avg):    ~${pretty(Math.round(bookingDelta / BOOKING_COUNT))}`);

  console.log(`\nPer-table breakdown (after):`);
  for (const t of afterTables.filter((x) => bookingTables.includes(x.table))) {
    const before = beforeTables.find((b) => b.table === t.table)?.totalBytes ?? 0;
    console.log(`  ${t.table.padEnd(22)} ${pretty(t.totalBytes).padStart(10)}  (+${pretty(t.totalBytes - before)})`);
  }

  const neonFreeGb = 0.5;
  const bookingsToFillNeon = Math.floor((neonFreeGb * 1024 * 1024 * 1024) / (bookingDelta / BOOKING_COUNT));
  console.log(`\n=== Projection (rough) ===`);
  console.log(`  At ~${pretty(bookingDelta / BOOKING_COUNT)}/booking, Neon free tier (~${neonFreeGb} GB)`);
  console.log(`  could hold on the order of ${bookingsToFillNeon.toLocaleString()} full sessions`);
  console.log(`  (ignoring users, indexes on other tables, and Postgres overhead — conservative ballpark).`);

  console.log(`\nCleaning up test data...`);
  await prisma.booking.deleteMany({ where: { userId: testUser.id } });
  await prisma.auditEvent.deleteMany({
    where: {
      actorId: testUser.id,
      action: { in: ["booking.create", "session.sign_in", "session.sign_out"] },
    },
  });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$executeRaw`VACUUM ANALYZE`;

  console.log("Done — test user and bookings removed.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
