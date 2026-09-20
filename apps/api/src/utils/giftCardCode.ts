const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid ambiguity

// A gift card code is a real, shareable credential (unlike a booking
// reference, it alone is enough to redeem real value) — 12 characters
// from a 32-symbol alphabet is ~60 bits of entropy, not brute-forceable,
// same reasoning as why a session token is long but a booking reference
// can be short.
export function generateGiftCardCode(): string {
  let code = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
