-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'ADMIN', 'GUEST');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LaserPhase" AS ENUM ('SIGN_IN', 'SIGN_OUT');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CLAIMED', 'EXPIRED');

-- CreateTable
CREATE TABLE "LabSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "labName" TEXT NOT NULL DEFAULT 'Kherani Lab',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "guestExpiresAt" TIMESTAMP(3),
    "notifyConfirmations" BOOLEAN NOT NULL DEFAULT true,
    "notifyReminders" BOOLEAN NOT NULL DEFAULT true,
    "standardHoursWeeklyLimitMinutes" INTEGER,
    "requiresBookingApproval" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "instrumentType" TEXT NOT NULL DEFAULT 'raman',
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxSessionMinutes" INTEGER NOT NULL DEFAULT 240,
    "advanceBookingDays" INTEGER NOT NULL DEFAULT 14,
    "minNoticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "cancellationCutoffMinutes" INTEGER NOT NULL DEFAULT 0,
    "standardHours" JSONB NOT NULL DEFAULT '{"days":[1,2,3,4,5],"start":"09:00","end":"17:00"}',
    "standardHoursWeeklyLimitMinutes" INTEGER DEFAULT 720,
    "afterHoursWeeklyLimitMinutes" INTEGER,
    "defaultRequiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "autoConfirmIfTrained" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentTraining" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainedByAdminId" TEXT,

    CONSTRAINT "InstrumentTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "noShow" BOOLEAN NOT NULL DEFAULT false,
    "reminder24Sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder1Sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentSession" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedOutAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "laserTurnedOn" BOOLEAN NOT NULL DEFAULT false,
    "laserAlreadyOn" BOOLEAN NOT NULL DEFAULT false,
    "signInSkipped" BOOLEAN NOT NULL DEFAULT false,
    "signOutSkipped" BOOLEAN NOT NULL DEFAULT false,
    "unsignedOut" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InstrumentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLaserReading" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wavelengthNm" INTEGER NOT NULL,
    "calibrated" BOOLEAN NOT NULL DEFAULT false,
    "photonCount" DOUBLE PRECISION,
    "phase" "LaserPhase" NOT NULL,

    CONSTRAINT "SessionLaserReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_slug_key" ON "Instrument"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentTraining_userId_instrumentId_key" ON "InstrumentTraining"("userId", "instrumentId");

-- CreateIndex
CREATE INDEX "Booking_instrumentId_startAt_idx" ON "Booking"("instrumentId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_userId_startAt_idx" ON "Booking"("userId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentSession_bookingId_key" ON "InstrumentSession"("bookingId");

-- CreateIndex
CREATE INDEX "InstrumentSession_userId_idx" ON "InstrumentSession"("userId");

-- CreateIndex
CREATE INDEX "InstrumentSession_signedOutAt_idx" ON "InstrumentSession"("signedOutAt");

-- CreateIndex
CREATE INDEX "SessionLaserReading_sessionId_idx" ON "SessionLaserReading"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_instrumentId_startAt_idx" ON "WaitlistEntry"("instrumentId", "startAt");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "InstrumentTraining" ADD CONSTRAINT "InstrumentTraining_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentTraining" ADD CONSTRAINT "InstrumentTraining_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentTraining" ADD CONSTRAINT "InstrumentTraining_trainedByAdminId_fkey" FOREIGN KEY ("trainedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentSession" ADD CONSTRAINT "InstrumentSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentSession" ADD CONSTRAINT "InstrumentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLaserReading" ADD CONSTRAINT "SessionLaserReading_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InstrumentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prevent overlapping active bookings on the same instrument at the database level.
-- Timestamps are stored in UTC (timestamp without time zone), so tsrange is correct.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap"
    EXCLUDE USING gist (
        "instrumentId" WITH =,
        tsrange("startAt", "endAt") WITH &&
    ) WHERE ("status" IN ('CONFIRMED', 'PENDING'));
