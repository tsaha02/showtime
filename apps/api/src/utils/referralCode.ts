const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I, same alphabet as bookingRef.ts

// An 8-character code, not cryptographically significant — this is a
// shareable "invite a friend" code, not an auth credential, so
// collision resistance (32^8, astronomically unlikely) matters far more
// than unpredictability. `User.referralCode` is `@unique`; a collision
// would surface as a Prisma unique-constraint error on create, which
// registerUser() doesn't currently retry on — acceptable at this
// probability, same trade-off `generateBookingReference` already makes.
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
