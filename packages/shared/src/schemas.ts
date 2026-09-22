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
    // Someone else's referralCode — optional, sets up the bonus payout
    // that actually happens on this new user's first CONFIRMED booking
    // (see walletService.ts's awardReferralBonusIfEligible), not at
    // registration time.
    referralCode: z.string().optional(),
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
  wheelchairAccessible: z.boolean().optional(),
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
  format: z.string().min(1).max(20).default("2D"),
  language: z.string().min(1).max(30).default("English"),
  prices: z.array(showPriceSchema).min(1),
});
export type ShowInput = z.infer<typeof showSchema>;

// --- Events (a second bookable content type — see the `Event`/`Show`
// comments in schema.prisma for why sessions reuse Show/ShowSeatPrice
// rather than a parallel set of tables) ---

export const eventCategorySchema = z.enum(["CONCERT", "COMEDY", "SPORTS", "THEATRE_PLAY", "WORKSHOP", "OTHER"]);

export const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: eventCategorySchema,
  durationMins: z.number().int().positive().max(1440),
  posterUrl: z.string().url().nullable().optional(),
});
export type EventInput = z.infer<typeof eventSchema>;

// Mirrors showSchema exactly, `eventId` instead of `movieId` — kept as
// a separate schema (not a discriminated union with showSchema) since
// the two admin forms that submit these are genuinely separate pages,
// not one form branching on content type.
export const eventSessionSchema = z.object({
  eventId: z.string().uuid(),
  screenId: z.string().uuid(),
  startTime: z.string().datetime(),
  format: z.string().min(1).max(20).default("2D"),
  language: z.string().min(1).max(30).default("English"),
  prices: z.array(showPriceSchema).min(1),
});
export type EventSessionInput = z.infer<typeof eventSessionSchema>;

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

export const foodCartItemSchema = z.object({
  foodItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
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
  couponCode: z.string().optional(),
  foodItems: z.array(foodCartItemSchema).max(20).optional(),
  // Only meaningful for logged-in users (guests have no wallet) — "apply
  // as much of my wallet balance as covers this order," never a specific
  // amount the client dictates.
  useWallet: z.boolean().optional(),
  // "Round up to the nearest ₹10 and add it as a donation" — see
  // donationService.ts. A demo feature (no real charity payout), but a
  // real extra charge computed the same way in both this endpoint and
  // create-payment-intent, same discipline as coupons/food/wallet.
  roundUpDonation: z.boolean().optional(),
});
export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

export const createPaymentIntentSchema = z.object({
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(MAX_SEATS_PER_BOOKING),
  couponCode: z.string().optional(),
  foodItems: z.array(foodCartItemSchema).max(20).optional(),
  useWallet: z.boolean().optional(),
  roundUpDonation: z.boolean().optional(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const previewCouponSchema = z.object({
  code: z.string().min(1),
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(MAX_SEATS_PER_BOOKING),
});
export type PreviewCouponInput = z.infer<typeof previewCouponSchema>;

export const couponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(20)
    .transform((v) => v.toUpperCase()),
  type: z.enum(["PERCENT", "FLAT"]),
  value: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CouponInput = z.infer<typeof couponSchema>;

export const foodItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().int().positive().max(10000),
  category: z.enum(["SNACK", "DRINK", "COMBO"]),
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
});
export type FoodItemInput = z.infer<typeof foodItemSchema>;

export const joinWaitlistSchema = z.object({
  movieId: z.string().uuid(),
  email: z.string().email(),
});
export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export const purchaseGiftCardSchema = z.object({
  value: z.number().int().min(100).max(10000),
  recipientEmail: z.string().email(),
  purchasedByEmail: z.string().email().optional(),
  message: z.string().max(300).optional(),
  paymentIntentId: z.string().optional(),
});
export type PurchaseGiftCardInput = z.infer<typeof purchaseGiftCardSchema>;

export const redeemGiftCardSchema = z.object({
  code: z.string().min(1),
});
export type RedeemGiftCardInput = z.infer<typeof redeemGiftCardSchema>;

export const findBookingSchema = z.object({
  reference: z.string().min(1),
  email: z.string().email(),
});
export type FindBookingInput = z.infer<typeof findBookingSchema>;

// `email` is only required when the caller isn't authenticated (a guest
// cancelling via "Find my booking") — a logged-in customer cancelling
// their own booking sends no body at all. See bookings.routes.ts's
// `/:id/cancel` for how the two cases are told apart.
export const cancelBookingSchema = z.object({
  email: z.string().email().optional(),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

// --- GenAI features (review summaries, catalog search, the booking
// assistant chat) — see apps/api/src/services/aiService.ts ---

export const aiSearchSchema = z.object({
  query: z.string().min(1).max(300),
});
export type AiSearchInput = z.infer<typeof aiSearchSchema>;

export const assistantChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export const assistantChatSchema = z.object({
  // The full conversation so far, sent by the client each turn — this
  // API is stateless (no server-side chat session/table), the same
  // "conversation history lives in the request, not a session store"
  // choice this app already makes for guest checkout. Capped at 20
  // turns so a runaway client conversation can't balloon token cost
  // per request indefinitely.
  messages: z.array(assistantChatMessageSchema).min(1).max(20),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

// --- Ratings ---

export const createRatingSchema = z.object({
  movieId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  isSpoiler: z.boolean().optional(),
});
export type CreateRatingInput = z.infer<typeof createRatingSchema>;

export const voteRatingSchema = z.object({
  helpful: z.boolean(),
});
export type VoteRatingInput = z.infer<typeof voteRatingSchema>;

// --- Push notifications ---

// Mirrors the shape `PushSubscription.toJSON()` gives the browser —
// `endpoint` plus the two encryption keys `web-push` needs server-side
// to encrypt a payload only that specific browser can decrypt.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
