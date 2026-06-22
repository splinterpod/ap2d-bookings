-- Remove unused 24-hour reminder flag (feature removed).
ALTER TABLE "Booking" DROP COLUMN "reminder24Sent";
