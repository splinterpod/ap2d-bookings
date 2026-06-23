-- Preserve originally booked end when a session signs out early and shortens endAt.
ALTER TABLE "Booking" ADD COLUMN "scheduledEndAt" TIMESTAMP(3);

UPDATE "Booking" SET "scheduledEndAt" = "endAt" WHERE "scheduledEndAt" IS NULL;

ALTER TABLE "Booking" ALTER COLUMN "scheduledEndAt" SET NOT NULL;
