import { BOOKING_REF_PREFIX } from "@showtime/shared";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid ambiguity

// Human-readable booking reference, e.g. "SHOW-8F3K2Q". Collisions are
// astronomically unlikely (32^6) but the Booking.reference column is
// still UNIQUE, and callers should retry on the rare Postgres conflict.
export function generateBookingReference(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${BOOKING_REF_PREFIX}-${code}`;
}
