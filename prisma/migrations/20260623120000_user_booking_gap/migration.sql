-- Minimum gap between the same user's bookings on one instrument (default 4 hours).
ALTER TABLE "Instrument" ADD COLUMN "minGapBetweenUserBookingsMinutes" INTEGER NOT NULL DEFAULT 240;
