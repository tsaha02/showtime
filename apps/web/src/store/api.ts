import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  MovieDTO,
  ShowDTO,
  EventDTO,
  TheatreDTO,
  RatingDTO,
  RatingsPageDTO,
  BookingDTO,
  AuthUserDTO,
  SeatMapResponseDTO,
  ConfirmBookingInput,
  CreatePaymentIntentInput,
  CreatePaymentIntentResponseDTO,
  CreateGenericPaymentIntentResponseDTO,
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  ResendOtpInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  FindBookingInput,
  CreateRatingInput,
  HoldSeatInput,
  ReleaseSeatInput,
  ExternalMovieSearchResultDTO,
  ExternalMovieDetailsDTO,
  DiscoverDetailDTO,
  CouponPreviewDTO,
  PreviewCouponInput,
  JoinWaitlistInput,
  FoodItemDTO,
  WalletTransactionDTO,
  VoteRatingInput,
  PurchaseGiftCardInput,
  RedeemGiftCardInput,
  GiftCardPurchaseResponseDTO,
  ReviewSummaryDTO,
  SemanticSearchResultDTO,
  AssistantChatMessageDTO,
  PushSubscribeInput,
  PushUnsubscribeInput,
} from "@showtime/shared";
import { getSessionId } from "../lib/sessionId";
import { clearUser } from "./slices/authSlice";

// Not exported from @showtime/shared yet (see apps/api/src/routes/offers.routes.ts) —
// mirrors that route's response shape exactly.
export interface OfferDTO {
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  expiresAt: string | null;
}

export type SeatMapResponse = SeatMapResponseDTO;

// A single RTK Query slice for every read/write against apps/api. Tag-based
// cache invalidation keeps things simple: e.g. confirming a booking
// invalidates "MyBookings" so the my-bookings list refetches, instead of us
// having to manually patch the cache after every mutation.
const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  credentials: "include",
  prepareHeaders: (headers) => {
    headers.set("x-session-id", getSessionId());
    return headers;
  },
});

// The access-token cookie is short-lived (15 min, see apps/api's
// jwt.ts) by design, so a 401 usually just means it expired, not that
// the user actually logged out — the long-lived refresh cookie (also
// httpOnly, never touched by this code directly) is still good. Before
// giving up, silently exchange it for a new access/refresh pair via
// POST /auth/refresh and retry the original request once. Only after
// THAT still comes back 401 (refresh cookie also expired/invalid, or
// this really is a fresh 401 on a request that isn't about auth at all)
// do we clear the logged-in user — same case this used to handle
// directly: a signed-valid cookie whose userId no longer exists
// server-side (see the matching comment in apps/api's errorHandler.ts).
//
// `refreshPromise` de-dupes concurrent 401s: if three queries fire at
// once and all get a stale access token back, they share ONE refresh
// call instead of racing three (which would have the second and third
// refresh calls try to use a refresh token the first one already
// rotated-and-revoked — see refreshTokenService.ts's reuse-detection
// comment for why that would actually log the user out, not just waste
// a request).
let refreshPromise: Promise<boolean> | null = null;

function requestUrl(args: string | Parameters<typeof rawBaseQuery>[0]): string {
  return typeof args === "string" ? args : args.url;
}

// These endpoints either establish a session themselves (a 401 here is
// a real "wrong password," not a stale token) or ARE the refresh call —
// retrying any of them through another refresh would be pointless at
// best and an infinite loop at worst.
const SKIP_REAUTH_URLS = new Set(["/auth/login", "/auth/register", "/auth/refresh"]);

const baseQueryWithAuthReset: typeof rawBaseQuery = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !SKIP_REAUTH_URLS.has(requestUrl(args))) {
    if (!refreshPromise) {
      // `rawBaseQuery`'s return type is `T | Promise<T>` (RTK Query's
      // `MaybePromise`), which doesn't have `.then` on the synchronous
      // branch — wrapping the await in an async IIFE (instead of
      // chaining `.then`/`.finally` directly on the call) sidesteps that
      // without needing to special-case the non-Promise branch.
      refreshPromise = (async () => {
        try {
          const refreshResult = await rawBaseQuery({ url: "/auth/refresh", method: "POST" }, api, extraOptions);
          return !refreshResult.error;
        } finally {
          refreshPromise = null;
        }
      })();
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  if (result.error?.status === 401) {
    api.dispatch(clearUser());
  }
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithAuthReset,
  tagTypes: ["Movie", "MyBookings", "Ratings", "Auth"],
  endpoints: (builder) => ({
    // --- Catalog ---
    getMovies: builder.query<MovieDTO[], { search?: string; genre?: string; city?: string; bookable?: boolean } | undefined>({
      query: (params) => ({ url: "/movies", params }),
      transformResponse: (res: { movies: MovieDTO[] }) => res.movies,
      providesTags: ["Movie"],
    }),
    getMovie: builder.query<MovieDTO, string>({
      query: (id) => `/movies/${id}`,
      transformResponse: (res: { movie: MovieDTO }) => res.movie,
      providesTags: (_res, _err, id) => [{ type: "Movie", id }],
    }),
    getMovieShows: builder.query<ShowDTO[], { movieId: string; city?: string; format?: string; language?: string }>({
      query: ({ movieId, city, format, language }) => ({
        url: `/movies/${movieId}/shows`,
        params: { ...(city ? { city } : {}), ...(format ? { format } : {}), ...(language ? { language } : {}) },
      }),
      transformResponse: (res: { shows: ShowDTO[] }) => res.shows,
    }),
    // `page` is 1-indexed; the server also returns `total`/`pageSize`/
    // `starCounts` alongside the page of ratings, used for the
    // load-more control and the star-distribution bars on MovieDetailPage.
    getMovieRatings: builder.query<RatingsPageDTO, { movieId: string; page?: number }>({
      query: ({ movieId, page }) => ({ url: `/movies/${movieId}/ratings`, params: page ? { page } : undefined }),
      providesTags: ["Ratings"],
    }),
    getTheatres: builder.query<TheatreDTO[], void>({
      query: () => "/theatres",
      transformResponse: (res: { theatres: TheatreDTO[] }) => res.theatres,
    }),
    getGenres: builder.query<string[], void>({
      query: () => "/movies/genres",
      transformResponse: (res: { genres: string[] }) => res.genres,
    }),
    getCities: builder.query<string[], void>({
      query: () => "/theatres/cities",
      transformResponse: (res: { cities: string[] }) => res.cities,
    }),
    // The big real-world Indian city list, used only to power the
    // Autocomplete's free-text search — a much larger, "real geography"
    // dataset than getCities' small serviceable-cities list, which still
    // governs actual movie filtering (see HomePage's comment).
    getIndiaCities: builder.query<string[], void>({
      query: () => "/locations/india-cities",
      transformResponse: (res: { cities: string[] }) => res.cities,
    }),
    reverseGeocode: builder.query<string | null, { lat: number; lon: number }>({
      query: ({ lat, lon }) => ({ url: "/locations/reverse-geocode", params: { lat, lon } }),
      transformResponse: (res: { city: string | null }) => res.city,
    }),
    // "You're near X, which we don't serve — but Y (Zkm away) is" — the
    // nearest ShowTime-serviceable city to a raw lat/lon, computed from
    // real theatre coordinates (see locationService.ts on the API side).
    getNearestCities: builder.query<{ city: string; distanceKm: number }[], { lat: number; lon: number }>({
      query: ({ lat, lon }) => ({ url: "/locations/nearest-cities", params: { lat, lon } }),
      transformResponse: (res: { nearest: { city: string; distanceKm: number }[] }) => res.nearest,
    }),

    // --- Events (concerts, comedy nights, plays — same booking engine as
    // Movies underneath: a "session" is just a Show row with kind: "EVENT",
    // so seat map / checkout code stays movie-and-event-agnostic) ---
    getEvents: builder.query<EventDTO[], { search?: string; category?: string; city?: string; bookable?: boolean } | undefined>({
      query: (params) => ({ url: "/events", params }),
      transformResponse: (res: { events: EventDTO[] }) => res.events,
    }),
    getEvent: builder.query<EventDTO, string>({
      query: (id) => `/events/${id}`,
      transformResponse: (res: { event: EventDTO }) => res.event,
    }),
    getEventSessions: builder.query<ShowDTO[], { eventId: string; city?: string; format?: string; language?: string }>({
      query: ({ eventId, city, format, language }) => ({
        url: `/events/${eventId}/sessions`,
        params: { ...(city ? { city } : {}), ...(format ? { format } : {}), ...(language ? { language } : {}) },
      }),
      transformResponse: (res: { sessions: ShowDTO[] }) => res.sessions,
    }),

    // --- Discover (browse-any-movie via OMDb, separate from the bookable catalog) ---
    discoverMovies: builder.query<ExternalMovieSearchResultDTO[], string>({
      query: (query) => ({ url: "/movies/discover", params: { query } }),
      transformResponse: (res: { results: ExternalMovieSearchResultDTO[] }) => res.results,
    }),
    getDiscoverDetail: builder.query<DiscoverDetailDTO, string>({
      query: (externalId) => `/movies/discover/${externalId}`,
    }),
    // A fixed set of well-known titles resolved through OMDb and cached
    // server-side, shown on SearchMoviesPage before the user has typed
    // anything — so that page never opens to a blank search box.
    getTrendingMovies: builder.query<ExternalMovieDetailsDTO[], void>({
      query: () => "/movies/discover/trending",
      transformResponse: (res: { results: ExternalMovieDetailsDTO[] }) => res.results,
    }),

    // --- Auth ---
    getMe: builder.query<AuthUserDTO, void>({
      query: () => "/auth/me",
      transformResponse: (res: { user: AuthUserDTO }) => res.user,
      providesTags: ["Auth"],
    }),
    login: builder.mutation<AuthUserDTO, LoginInput>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: (res: { user: AuthUserDTO }) => res.user,
      invalidatesTags: ["Auth", "MyBookings"],
    }),
    register: builder.mutation<AuthUserDTO, RegisterInput>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      transformResponse: (res: { user: AuthUserDTO }) => res.user,
      invalidatesTags: ["Auth", "MyBookings"],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: ["Auth", "MyBookings"],
    }),
    verifyEmail: builder.mutation<void, VerifyEmailInput>({
      query: (body) => ({ url: "/auth/verify-email", method: "POST", body }),
      invalidatesTags: ["Auth"],
    }),
    resendOtp: builder.mutation<void, ResendOtpInput>({
      query: (body) => ({ url: "/auth/resend-otp", method: "POST", body }),
    }),
    forgotPassword: builder.mutation<void, ForgotPasswordInput>({
      query: (body) => ({ url: "/auth/forgot-password", method: "POST", body }),
    }),
    resetPassword: builder.mutation<AuthUserDTO, ResetPasswordInput>({
      query: (body) => ({ url: "/auth/reset-password", method: "POST", body }),
      transformResponse: (res: { user: AuthUserDTO }) => res.user,
      invalidatesTags: ["Auth", "MyBookings"],
    }),

    // --- Seat map & holds ---
    // Not tag-cached: the seat map is a live snapshot that's kept up to date
    // by socket events merged into bookingSlice, not by RTK Query refetching.
    getSeatMap: builder.query<SeatMapResponse, string>({
      query: (showId) => `/shows/${showId}/seatmap`,
    }),
    holdSeat: builder.mutation<{ holdExpiresAt: string }, HoldSeatInput>({
      query: (body) => ({ url: "/seats/hold", method: "POST", body }),
    }),
    releaseSeat: builder.mutation<void, ReleaseSeatInput>({
      query: (body) => ({ url: "/seats/release", method: "POST", body }),
    }),

    // --- Bookings ---
    createPaymentIntent: builder.mutation<CreatePaymentIntentResponseDTO, CreatePaymentIntentInput>({
      query: (body) => ({ url: "/bookings/create-payment-intent", method: "POST", body }),
    }),
    previewCoupon: builder.mutation<CouponPreviewDTO, PreviewCouponInput>({
      query: (body) => ({ url: "/bookings/preview-coupon", method: "POST", body }),
    }),
    confirmBooking: builder.mutation<BookingDTO, ConfirmBookingInput>({
      query: (body) => ({ url: "/bookings/confirm", method: "POST", body }),
      transformResponse: (res: { booking: BookingDTO }) => res.booking,
      invalidatesTags: ["MyBookings"],
    }),
    getMyBookings: builder.query<BookingDTO[], void>({
      query: () => "/bookings/mine",
      transformResponse: (res: { bookings: BookingDTO[] }) => res.bookings,
      providesTags: ["MyBookings"],
    }),
    findBooking: builder.mutation<BookingDTO, FindBookingInput>({
      query: (body) => ({ url: "/bookings/find", method: "POST", body }),
      transformResponse: (res: { booking: BookingDTO }) => res.booking,
    }),
    cancelBooking: builder.mutation<void, string>({
      query: (id) => ({ url: `/bookings/${id}/cancel`, method: "POST" }),
      invalidatesTags: ["MyBookings"],
    }),

    // --- Ratings ---
    createRating: builder.mutation<RatingDTO, CreateRatingInput>({
      query: (body) => ({ url: "/ratings", method: "POST", body }),
      transformResponse: (res: { rating: RatingDTO }) => res.rating,
      invalidatesTags: ["Ratings", "Movie"],
    }),

    // --- Waitlist ---
    joinWaitlist: builder.mutation<void, JoinWaitlistInput>({
      query: (body) => ({ url: "/waitlist", method: "POST", body }),
    }),

    // --- Food & Beverages ---
    getFoodItems: builder.query<FoodItemDTO[], void>({
      query: () => "/food-items",
      transformResponse: (res: { foodItems: FoodItemDTO[] }) => res.foodItems,
    }),

    // --- Wallet ---
    getWalletTransactions: builder.query<WalletTransactionDTO[], void>({
      query: () => "/wallet/transactions",
      transformResponse: (res: { transactions: WalletTransactionDTO[] }) => res.transactions,
    }),

    // --- Review voting ---
    voteRating: builder.mutation<
      { helpfulCount: number; notHelpfulCount: number; myVote: boolean | null },
      { ratingId: string } & VoteRatingInput
    >({
      query: ({ ratingId, ...body }) => ({ url: `/ratings/${ratingId}/vote`, method: "POST", body }),
    }),

    // --- Gift cards ---
    createGiftCardPaymentIntent: builder.mutation<CreateGenericPaymentIntentResponseDTO, { value: number }>({
      query: (body) => ({ url: "/gift-cards/create-payment-intent", method: "POST", body }),
    }),
    purchaseGiftCard: builder.mutation<GiftCardPurchaseResponseDTO, PurchaseGiftCardInput>({
      query: (body) => ({ url: "/gift-cards/purchase", method: "POST", body }),
    }),
    redeemGiftCard: builder.mutation<{ value: number }, RedeemGiftCardInput>({
      query: (body) => ({ url: "/gift-cards/redeem", method: "POST", body }),
      invalidatesTags: ["Auth"],
    }),

    // --- Recommendations ---
    getSimilarMovies: builder.query<MovieDTO[], string>({
      query: (movieId) => `/movies/${movieId}/similar`,
      transformResponse: (res: { movies: MovieDTO[] }) => res.movies,
    }),
    getRecommendedMovies: builder.query<MovieDTO[], void>({
      query: () => "/movies/recommended",
      transformResponse: (res: { movies: MovieDTO[] }) => res.movies,
    }),

    // --- Offers wall ---
    getOffers: builder.query<OfferDTO[], void>({
      query: () => "/offers",
      transformResponse: (res: { offers: OfferDTO[] }) => res.offers,
    }),

    // --- Charity round-up ---
    getDonationsTotal: builder.query<number, void>({
      query: () => "/donations/total",
      transformResponse: (res: { total: number }) => res.total,
    }),

    // --- GenAI features (Groq-backed, gracefully degrade to null when
    // AI isn't configured — see each service's comments on the API side) ---
    getReviewSummary: builder.query<ReviewSummaryDTO | null, string>({
      query: (movieId) => `/movies/${movieId}/review-summary`,
      transformResponse: (res: { summary: ReviewSummaryDTO | null }) => res.summary,
    }),
    aiSearch: builder.mutation<SemanticSearchResultDTO[] | null, string>({
      query: (query) => ({ url: "/ai/search", method: "POST", body: { query } }),
      transformResponse: (res: { results: SemanticSearchResultDTO[] | null }) => res.results,
    }),
    chatWithAssistant: builder.mutation<string, AssistantChatMessageDTO[]>({
      query: (messages) => ({ url: "/ai/chat", method: "POST", body: { messages } }),
      transformResponse: (res: { reply: string }) => res.reply,
    }),

    // --- Push notifications (the "you left mid-booking" nudge — see
    // apps/api's pushNotificationService.ts) ---
    getVapidPublicKey: builder.query<string | null, void>({
      query: () => "/push/vapid-public-key",
      transformResponse: (res: { publicKey: string | null }) => res.publicKey,
    }),
    subscribePush: builder.mutation<void, PushSubscribeInput>({
      query: (body) => ({ url: "/push/subscribe", method: "POST", body }),
    }),
    unsubscribePush: builder.mutation<void, PushUnsubscribeInput>({
      query: (body) => ({ url: "/push/unsubscribe", method: "POST", body }),
    }),
  }),
});

export const {
  useGetMoviesQuery,
  useGetMovieQuery,
  useGetMovieShowsQuery,
  useGetMovieRatingsQuery,
  useGetTheatresQuery,
  useGetGenresQuery,
  useGetCitiesQuery,
  useGetIndiaCitiesQuery,
  useLazyReverseGeocodeQuery,
  useLazyGetNearestCitiesQuery,
  useGetEventsQuery,
  useGetEventQuery,
  useGetEventSessionsQuery,
  useDiscoverMoviesQuery,
  useLazyDiscoverMoviesQuery,
  useGetDiscoverDetailQuery,
  useGetTrendingMoviesQuery,
  useGetSeatMapQuery,
  useHoldSeatMutation,
  useReleaseSeatMutation,
  useGetMeQuery,
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useVerifyEmailMutation,
  useResendOtpMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useCreatePaymentIntentMutation,
  usePreviewCouponMutation,
  useConfirmBookingMutation,
  useGetMyBookingsQuery,
  useFindBookingMutation,
  useCancelBookingMutation,
  useCreateRatingMutation,
  useJoinWaitlistMutation,
  useGetFoodItemsQuery,
  useGetWalletTransactionsQuery,
  useVoteRatingMutation,
  useCreateGiftCardPaymentIntentMutation,
  usePurchaseGiftCardMutation,
  useRedeemGiftCardMutation,
  useGetSimilarMoviesQuery,
  useGetRecommendedMoviesQuery,
  useGetOffersQuery,
  useGetDonationsTotalQuery,
  useGetReviewSummaryQuery,
  useAiSearchMutation,
  useChatWithAssistantMutation,
  useLazyGetVapidPublicKeyQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
} = api;
