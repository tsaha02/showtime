import { redis } from "../lib/redis";

const OTP_TTL_SECONDS = 600; // 10 minutes

// `purpose` namespaces the key so an email-verification code and a
// password-reset code for the same user can never collide with or
// invalidate each other (both could plausibly be in flight for the same
// user around the same time — e.g. someone resets their password right
// after registering, before verifying).
export type OtpPurpose = "verify-email" | "reset-password";

const otpKey = (userId: string, purpose: OtpPurpose) => `otp:${purpose}:${userId}`;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // always 6 digits
}

// Reuses the same Redis instance as the seat-hold locks (see
// seatHoldService.ts) for the same reason: a short-lived, self-expiring
// key is exactly what Redis's `SET ... EX` is for, and there's no need
// for a second store just to hold a 6-digit code for 10 minutes.
export async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const otp = generateOtp();
  await redis.set(otpKey(userId, purpose), otp, "EX", OTP_TTL_SECONDS);
  return otp;
}

export async function verifyOtp(userId: string, submittedOtp: string, purpose: OtpPurpose): Promise<boolean> {
  const stored = await redis.get(otpKey(userId, purpose));
  if (!stored || stored !== submittedOtp) return false;
  await redis.del(otpKey(userId, purpose));
  return true;
}
