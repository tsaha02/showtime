import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  adminOrigin: process.env.ADMIN_ORIGIN ?? "http://localhost:5174",
  // Every one of these three is optional and degrades gracefully rather
  // than failing app boot — none of them are on the booking/concurrency
  // path, they're enrichments (real movie data, real email delivery).
  omdbApiKey: process.env.OMDB_API_KEY || undefined,
  resendApiKey: process.env.RESEND_API_KEY || undefined,
  // Resend's shared testing sender — works immediately with no domain
  // setup, but (per Resend's sandbox rules) can only deliver to the
  // email address that owns the Resend account until a real domain is
  // verified. Override once a verified sending domain exists.
  emailFrom: process.env.EMAIL_FROM || "ShowTime <onboarding@resend.dev>",
  // Test-mode Stripe keys (sk_test_.../pk_test_... — never live keys for
  // this project). Optional, same graceful-degradation posture as OMDb/
  // Resend above: without it, booking falls back to the original mocked
  // "always succeeds unless simulatePaymentFailure" behavior (see
  // paymentService.ts) rather than blocking the app's centerpiece
  // feature on a third-party credential.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
};
