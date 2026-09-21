import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { signAuthToken } from "../utils/jwt";
import { issueRefreshToken } from "./refreshTokenService";
import { issueOtp, verifyOtp } from "./otpService";
import { sendOtpEmail, sendPasswordResetEmail } from "./emailService";
import { generateReferralCode } from "../utils/referralCode";
import type {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  ResendOtpInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UserRole,
} from "@showtime/shared";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  walletBalance: number;
  referralCode: string;
}

// The same handful of fields get shaped for the client in four places
// now (register/login/reset-password's session issuance, plus the
// refresh endpoint) — factored out once rather than drifting into four
// slightly-different-looking object literals over time.
export function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    walletBalance: user.walletBalance,
    referralCode: user.referralCode,
  };
}

const SALT_ROUNDS = 10;

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  // A referral code that doesn't match any user is silently ignored
  // (treated as "no referral") rather than rejected — a typo'd or
  // expired-looking code shouldn't be able to block someone from
  // registering at all.
  const referrer = input.referralCode
    ? await prisma.user.findUnique({ where: { referralCode: input.referralCode.toUpperCase() } })
    : null;

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: "CUSTOMER",
      referralCode: generateReferralCode(),
      referredById: referrer?.id,
    },
  });

  // Fire-and-forget: registration must succeed (and the user gets a
  // working, logged-in session) regardless of whether the OTP email
  // actually sends — see emailService.ts's module comment. Verification
  // is informational in this app (doesn't gate login/booking/rating), so
  // there's nothing time-sensitive here that needs an `await`.
  const otp = await issueOtp(user.id, "verify-email");
  void sendOtpEmail(user.email, user.name, otp);

  return issueSession(user, "CUSTOMER");
}

export async function loginUser(input: LoginInput, requireRole?: "ADMIN") {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw ApiError.unauthorized("Invalid email or password");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized("Invalid email or password");

  if (requireRole && user.role !== requireRole) {
    throw ApiError.forbidden("This account does not have admin access");
  }

  return issueSession(user, requireRole ?? "CUSTOMER");
}

export async function verifyUserEmail(input: VerifyEmailInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same response either way (a generic failure) whether the email
  // doesn't exist or the code is wrong, for the same reason
  // POST /api/bookings/find always returns the same 404 for both cases —
  // no reason to let this endpoint confirm which emails have accounts.
  if (!user) throw ApiError.badRequest("Invalid or expired code");
  if (user.emailVerified) return; // already verified — treat as success, not an error

  const ok = await verifyOtp(user.id, input.otp, "verify-email");
  if (!ok) throw ApiError.badRequest("Invalid or expired code");

  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
}

export async function resendOtp(input: ResendOtpInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.emailVerified) return; // silently no-op — don't reveal account existence/state

  const otp = await issueOtp(user.id, "verify-email");
  void sendOtpEmail(user.email, user.name, otp);
}

// Always resolves successfully (204 at the route level) whether or not
// an account exists for this email — the same non-revealing posture as
// resendOtp above and the guest booking lookup: an attacker probing
// "does this email have an account" must get an identical response
// either way.
export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) return;

  const otp = await issueOtp(user.id, "reset-password");
  void sendPasswordResetEmail(user.email, user.name, otp);
}

// Verifying the OTP and setting the new password happen together
// (there's no separate "OTP verified, now set a password" step) so a
// checked-but-unused reset code can't be left sitting around as a
// standing credential — the code and the password change are one atomic
// user action.
export async function resetPassword(input: ResetPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same generic failure regardless of cause — invalid email, wrong
  // code, or expired code — for the same reason verifyUserEmail does.
  if (!user) throw ApiError.badRequest("Invalid or expired code");

  const ok = await verifyOtp(user.id, input.otp, "reset-password");
  if (!ok) throw ApiError.badRequest("Invalid or expired code");

  const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Logging the user in right after a successful reset (rather than
  // making them separately log in with the new password) matches how
  // registration already behaves, and there's no security reason not to
  // — they just proved control of the account via the emailed code.
  return issueSession(updated, "CUSTOMER");
}

// `audience` picks which session this is for — a user with the ADMIN
// role can still hold a CUSTOMER session too (they're the same person,
// two separate frontends/cookie jars) — see refreshTokenService.ts's
// `RefreshToken.audience` for why this needs to be tracked all the way
// through to the stored refresh token, not just the route that issued it.
async function issueSession(user: UserRecord, audience: UserRole) {
  const accessToken = signAuthToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id, audience);
  return { accessToken, refreshToken, user: toPublicUser(user) };
}
