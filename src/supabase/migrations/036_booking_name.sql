-- Add user-defined name field to bookings
-- Serves as the human-readable label for any booking.
-- If set, takes priority over booking_number in the UI.
-- If not set, UI falls back to the natural identifier per service type
-- (BL Number for Forwarding, Entry Number for Brokerage, etc.)

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS name TEXT;
