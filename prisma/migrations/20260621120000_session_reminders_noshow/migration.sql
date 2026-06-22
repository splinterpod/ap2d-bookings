-- Session reminder and no-show settings on instruments; tracking flags on bookings.
ALTER TABLE "Instrument" ADD COLUMN "lateSignInReminderMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Instrument" ADD COLUMN "noShowCancelMinutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Booking" ADD COLUMN "lateSignInReminderSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "autoSignedOutNotified" BOOLEAN NOT NULL DEFAULT false;
