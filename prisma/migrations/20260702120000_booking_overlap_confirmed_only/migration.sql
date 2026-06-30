-- Pending bookings should not block the calendar or other requests (admin approves later).
-- Overlap is enforced on approval for pending rows; only confirmed bookings reserve the instrument.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_no_overlap";

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap"
    EXCLUDE USING gist (
        "instrumentId" WITH =,
        tsrange("startAt", "endAt") WITH &&
    ) WHERE ("status" = 'CONFIRMED');
