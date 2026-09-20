import type {
  SEAT_CATEGORIES,
  BOOKING_STATUSES,
  SEAT_STATUSES,
  USER_ROLES,
} from "./constants";

export type SeatCategory = (typeof SEAT_CATEGORIES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type SeatStatus = (typeof SEAT_STATUSES)[number];
export type UserRole = (typeof USER_ROLES)[number];

export interface MovieDTO {
  id: string;
  title: string;
  description: string;
  durationMins: number;
  genre: string;
  posterUrl: string | null;
  releaseDate: string;
  averageRating: number;
  ratingCount: number;
  externalId: string | null;
  createdAt: string;
}

// Generic name deliberately not tied to a specific provider (currently
// OMDb, previously TMDB) — the admin "import a movie" contract shouldn't
// need to change again if the backing data source ever does.
export interface ExternalMovieSearchResultDTO {
  externalId: string;
  title: string;
  overview: string;
  posterUrl: string | null;
  releaseDate: string | null;
}

export interface ExternalMovieDetailsDTO extends ExternalMovieSearchResultDTO {
  durationMins: number | null;
  genre: string;
  imdbRating: number | null;
  director: string | null;
  actors: string | null;
  awards: string | null;
  language: string | null;
  country: string | null;
  rated: string | null;
}

// Response for GET /api/movies/discover/:externalId — the customer-
// facing "browse any real movie" detail view. `localMovieId`/`bookable`
// tell the frontend whether this title also happens to be in ShowTime's
// own bookable catalog (see movies.routes.ts's `/discover*` comment for
// why this is a separate concept from the catalog listing itself).
export interface DiscoverDetailDTO {
  details: ExternalMovieDetailsDTO;
  localMovieId: string | null;
  bookable: boolean;
}

// A real cinema location from OpenStreetMap (admin "Import real
// theatres" flow — see apps/api's theatreDiscoveryService.ts). `osmId`
// is the OSM node reference (e.g. "node/2017123229"), used as
// `Theatre.osmId` so re-importing the same location updates rather than
// duplicates it.
export interface DiscoveredTheatreDTO {
  osmId: string;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
}

export interface RatingsPageDTO {
  ratings: RatingDTO[];
  total: number;
  page: number;
  pageSize: number;
  starCounts: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface TheatreDTO {
  id: string;
  name: string;
  city: string;
  address: string;
}

export interface ScreenDTO {
  id: string;
  theatreId: string;
  name: string;
}

export interface SeatDTO {
  id: string;
  row: number;
  col: number;
  label: string;
  category: SeatCategory;
  wheelchairAccessible: boolean;
}

// A scheduled, bookable session — for a Movie OR an Event (`kind`
// says which; the corresponding id is set, the other is null). Used
// for both `GET /api/movies/:id/shows` and `GET /api/events/:id/sessions`
// — one shape, since the two are otherwise identical (same screen/
// pricing/seat-hold machinery underneath).
export type ShowKind = "MOVIE" | "EVENT";

export interface ShowDTO {
  id: string;
  kind: ShowKind;
  movieId: string | null;
  eventId: string | null;
  screenId: string;
  startTime: string;
  endTime: string;
  screenName: string;
  theatreName: string;
  theatreCity: string;
  format: string;
  language: string;
  prices: Record<SeatCategory, number>;
}

export type EventCategory = "CONCERT" | "COMEDY" | "SPORTS" | "THEATRE_PLAY" | "WORKSHOP" | "OTHER";

export interface EventDTO {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  durationMins: number;
  posterUrl: string | null;
  createdAt: string;
}

// Seat map entry as sent to the client: physical seat + its live status.
// `heldByMe` lets the frontend distinguish "held by someone else" (locked,
// greyed out) from "held by me" (selected, shows countdown).
export interface SeatMapEntryDTO extends SeatDTO {
  status: SeatStatus;
  heldByMe: boolean;
  holdExpiresAt: string | null;
}

export interface SeatMapResponseDTO {
  seats: SeatMapEntryDTO[];
  show: {
    id: string;
    movieTitle: string;
    theatreName: string;
    screenName: string;
    startTime: string;
    prices: Record<SeatCategory, number>;
  };
}

export interface BookingSeatDTO {
  seatId: string;
  label: string;
  category: SeatCategory;
  price: number;
}

export type FoodCategory = "SNACK" | "DRINK" | "COMBO";

export interface FoodItemDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: FoodCategory;
  imageUrl: string | null;
  active: boolean;
}

export interface BookingFoodItemDTO {
  name: string;
  price: number;
  quantity: number;
}

export interface BookingDTO {
  id: string;
  reference: string;
  status: BookingStatus;
  showId: string;
  movieTitle: string;
  theatreName: string;
  screenName: string;
  showStartTime: string;
  seats: BookingSeatDTO[];
  totalAmount: number;
  couponCode: string | null;
  discountAmount: number;
  foodItems: BookingFoodItemDTO[];
  foodTotal: number;
  walletAmountUsed: number;
  donationAmount: number;
  guestName: string | null;
  guestEmail: string | null;
  createdAt: string;
}

export type CouponType = "PERCENT" | "FLAT";

export interface CouponDTO {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

// Response for POST /api/bookings/preview-coupon — validates a code
// against a specific cart total WITHOUT applying it yet (the actual
// application/verification happens again, non-negotiably, inside
// confirmBooking — this endpoint exists purely so the checkout UI can
// show "₹50 off" before the user commits to paying).
export interface CouponPreviewDTO {
  valid: boolean;
  message: string;
  discountAmount: number;
  finalAmount: number;
}

// Response for POST /api/bookings/create-payment-intent. The
// `stripeConfigured` discriminant is what the frontend branches on: when
// false, skip Stripe Elements entirely and just call confirm-booking
// directly with the old `simulatePaymentFailure` flag (mocked payment).
export type CreatePaymentIntentResponseDTO =
  | { stripeConfigured: true; clientSecret: string; paymentIntentId: string; amount: number }
  | { stripeConfigured: false };

export interface RatingDTO {
  id: string;
  movieId: string;
  userId: string;
  userName: string;
  stars: number;
  comment: string | null;
  isSpoiler: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  // Only present when the request is authenticated — the viewer's own
  // vote on this rating, if they've cast one. Absent (not just null) for
  // anonymous requests, since "no vote" and "not logged in" are different
  // things the frontend needs to distinguish.
  myVote?: boolean | null;
  createdAt: string;
}

export interface AuthUserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  walletBalance: number;
  referralCode: string;
}

export interface AnalyticsOverviewDTO {
  windowDays: number;
  totalRevenue: number;
  totalBookings: number;
  totalSeatsSold: number;
  bookingsByStatus: Record<string, number>;
  revenueByDay: { date: string; revenue: number }[];
  topMovies: { movieId: string; title: string; revenue: number; bookings: number }[];
  topEvents: { eventId: string; title: string; revenue: number; bookings: number }[];
  bookingsByCity: { city: string; bookings: number }[];
}

export interface GiftCardPurchaseResponseDTO {
  code: string;
  value: number;
}

export type CreateGenericPaymentIntentResponseDTO =
  | { stripeConfigured: true; clientSecret: string; paymentIntentId: string; amount: number }
  | { stripeConfigured: false };

export interface WalletTransactionDTO {
  id: string;
  amount: number;
  reason: "CANCELLATION_REFUND" | "REFERRAL_BONUS" | "SPENT_AT_CHECKOUT" | "ADMIN_ADJUSTMENT";
  bookingId: string | null;
  createdAt: string;
}

// --- Socket.io payload shapes ---

export interface SeatHeldPayload {
  showId: string;
  seatId: string;
  holdExpiresAt: string;
}

export interface SeatReleasedPayload {
  showId: string;
  seatId: string;
}

export interface SeatBookedPayload {
  showId: string;
  seatIds: string[];
}

export interface BookingConfirmedPayload {
  booking: BookingDTO;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}
