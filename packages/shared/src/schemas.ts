import { z } from "zod";
import { SEAT_CATEGORIES, MAX_SEATS_PER_BOOKING } from "./constants";

export const seatCategorySchema = z.enum(SEAT_CATEGORIES);

// --- Auth ---

export const registerSchema = z
  .object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendOtpSchema = z.object({
  email: z.string().email(),
});
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    otp: z.string().length(6),
    newPassword: z.string().min(8).max(72),
    confirmNewPassword: z.string().min(8).max(72),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// --- Catalog (admin writes) ---

export const movieSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  durationMins: z.number().int().positive().max(600),
  genre: z.string().min(1).max(100),
  posterUrl: z.string().url().nullable().optional(),
  releaseDate: z.string().date(),
});
export type MovieInput = z.infer<typeof movieSchema>;

export const theatreSchema = z.object({
  name: z.string().min(1).max(150),
  city: z.string().min(1).max(100),
  address: z.string().min(1).max(300),
});
export type TheatreInput = z.infer<typeof theatreSchema>;

export const screenSchema = z.object({
  theatreId: z.string().uuid(),
  name: z.string().min(1).max(50),
});
export type ScreenInput = z.infer<typeof screenSchema>;

// A seat layout is defined as a flat list of seats with grid coordinates.
// Rows/cols need not be dense — omitting a (row, col) pair models an aisle
// gap or a missing seat without needing a padded 2D array.
export const seatInputSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  label: z.string().min(1).max(10),
  category: seatCategorySchema,
});
export const seatLayoutSchema = z.object({
  screenId: z.string().uuid(),
  seats: z.array(seatInputSchema).min(1),
});
export type SeatLayoutInput = z.infer<typeof seatLayoutSchema>;

export const importExternalMovieSchema = z.object({
  externalId: z.string().min(1),
});
export type ImportExternalMovieInput = z.infer<typeof importExternalMovieSchema>;

export const showPriceSchema = z.object({
  category: seatCategorySchema,
  price: z.number().positive().max(100000),
});
export const showSchema = z.object({
  movieId: z.string().uuid(),
  screenId: z.string().uuid(),
  startTime: z.string().datetime(),
  prices: z.array(showPriceSchema).min(1),
});
export type ShowInput = z.infer<typeof showSchema>;

// --- Booking ---

export const holdSeatSchema = z.object({
  showId: z.string().uuid(),
  seatId: z.string().uuid(),
});
export type HoldSeatInput = z.infer<typeof holdSeatSchema>;

export const releaseSeatSchema = z.object({
  showId: z.string().uuid(),
  seatId: z.string().uuid(),
});
export type ReleaseSeatInput = z.infer<typeof releaseSeatSchema>;

const guestDetailsSchema = z.object({
  guestName: z.string().min(2).max(100),
  guestEmail: z.string().email(),
  guestPhone: z.string().max(20).optional(),
});

// A booking belongs to EITHER an authenticated user (identified via the
// session cookie, not part of this body) OR a guest. When the request has
// no auth cookie, guestDetails is required; the server enforces this
// exclusivity rather than trusting a client-sent flag.
export const confirmBookingSchema = z.object({
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(MAX_SEATS_PER_BOOKING),
  guestDetails: guestDetailsSchema.optional(),
  // Only meaningful when Stripe is NOT configured server-side — a demo-
  // only way to exercise the payment-decline path (see bookingService.ts).
  simulatePaymentFailure: z.boolean().optional(),
  // Required instead, when Stripe IS configured — the id of a
  // PaymentIntent the client already confirmed with Stripe.js, which the
  // server re-verifies directly with Stripe before booking anything.
  paymentIntentId: z.string().optional(),
});
export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

export const createPaymentIntentSchema = z.object({
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(MAX_SEATS_PER_BOOKING),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const findBookingSchema = z.object({
  reference: z.string().min(1),
  email: z.string().email(),
});
export type FindBookingInput = z.infer<typeof findBookingSchema>;

// --- Ratings ---

export const createRatingSchema = z.object({
  movieId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type CreateRatingInput = z.infer<typeof createRatingSchema>;
