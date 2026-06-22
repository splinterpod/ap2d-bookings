-- Per-instrument user limit overrides
CREATE TABLE "UserInstrumentLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "standardHoursWeeklyLimitMinutes" INTEGER,
    "requiresBookingApproval" BOOLEAN,

    CONSTRAINT "UserInstrumentLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInstrumentLimit_userId_instrumentId_key" ON "UserInstrumentLimit"("userId", "instrumentId");

ALTER TABLE "UserInstrumentLimit" ADD CONSTRAINT "UserInstrumentLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInstrumentLimit" ADD CONSTRAINT "UserInstrumentLimit_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy legacy user-level overrides to each instrument
INSERT INTO "UserInstrumentLimit" ("id", "userId", "instrumentId", "standardHoursWeeklyLimitMinutes", "requiresBookingApproval")
SELECT
    u."id" || ':' || i."id",
    u."id",
    i."id",
    u."standardHoursWeeklyLimitMinutes",
    u."requiresBookingApproval"
FROM "User" u
CROSS JOIN "Instrument" i
WHERE u."standardHoursWeeklyLimitMinutes" IS NOT NULL
   OR u."requiresBookingApproval" IS NOT NULL;
