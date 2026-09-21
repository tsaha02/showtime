import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  MovieDTO,
  TheatreDTO,
  ScreenDTO,
  SeatDTO,
  BookingDTO,
  AuthUserDTO,
  SeatCategory,
  ExternalMovieSearchResultDTO,
  DiscoveredTheatreDTO,
  CouponDTO,
  CouponInput,
  FoodItemDTO,
  FoodItemInput,
  AnalyticsOverviewDTO,
  EventDTO,
  EventInput,
} from "@showtime/shared";
import { setUnauthenticated } from "./authSlice";

// VITE_API_URL already includes the /admin prefix (see .env) — every
// endpoint path below is relative to http://localhost:4000/api/admin.
const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/admin";

export interface TheatreWithScreens extends TheatreDTO {
  screens: ScreenDTO[];
}

export interface SeatLayoutDTO {
  id: string;
  screenId: string;
  seats: SeatDTO[];
}

export interface ShowWithDetails {
  id: string;
  movieId: string;
  screenId: string;
  startTime: string;
  endTime: string;
  movie: MovieDTO;
  screen: ScreenDTO & { theatre: TheatreDTO };
  prices: { id: string; category: SeatCategory; price: number }[];
}

export interface BookingWithEmail extends BookingDTO {
  userEmail: string | null;
}

export interface RatingWithMovie {
  id: string;
  movieId: string;
  movieTitle: string;
  userId: string;
  userName: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

export interface MovieInput {
  title: string;
  description: string;
  durationMins: number;
  genre: string;
  posterUrl?: string | null;
  releaseDate: string;
}

export interface TheatreInput {
  name: string;
  city: string;
  address: string;
}

export interface SeatInput {
  row: number;
  col: number;
  label: string;
  category: SeatCategory;
  wheelchairAccessible?: boolean;
}

export interface GiftCardDTO {
  id: string;
  code: string;
  value: number;
  purchasedByEmail: string;
  recipientEmail: string | null;
  redeemed: boolean;
  redeemedAt: string | null;
  createdAt: string;
}

export interface ShowInput {
  movieId: string;
  screenId: string;
  startTime: string;
  prices: { category: SeatCategory; price: number }[];
}

export interface EventSessionWithDetails {
  id: string;
  eventId: string;
  screenId: string;
  startTime: string;
  endTime: string;
  format: string;
  language: string;
  event: EventDTO;
  screen: ScreenDTO & { theatre: TheatreDTO };
  prices: { id: string; category: SeatCategory; price: number }[];
}

export interface EventSessionInput {
  eventId: string;
  screenId: string;
  startTime: string;
  format?: string;
  language?: string;
  prices: { category: SeatCategory; price: number }[];
}

const rawBaseQuery = fetchBaseQuery({ baseUrl, credentials: "include" });

// Same reauth pattern as apps/web/src/store/api.ts — see its longer
// comment for the full reasoning. Short version: the access-token
// cookie is short-lived on purpose (15 min, apps/api's jwt.ts), so a 401
// usually just means "silently refresh it," not "actually logged out."
// This app previously had NO 401 handling at all (AuthGate only checked
// the initial `/auth/me` call's result, so a token expiring mid-session
// during any other mutation — creating a show, importing a movie —
// would 401 with no recovery and no visible explanation); this both
// adds the missing recovery and makes an eventual real logout (refresh
// token also expired) actually update `authSlice` instead of just
// failing requests silently.
let refreshPromise: Promise<boolean> | null = null;

function requestUrl(args: string | Parameters<typeof rawBaseQuery>[0]): string {
  return typeof args === "string" ? args : args.url;
}

const SKIP_REAUTH_URLS = new Set(["auth/login", "auth/refresh"]);

const baseQueryWithReauth: typeof rawBaseQuery = async (args, api, extraOptions) => {
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
          const refreshResult = await rawBaseQuery({ url: "auth/refresh", method: "POST" }, api, extraOptions);
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
    api.dispatch(setUnauthenticated());
  }
  return result;
};

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Movie",
    "Theatre",
    "Layout",
    "Show",
    "Booking",
    "Rating",
    "Coupon",
    "FoodItem",
    "Auth",
    "Event",
    "EventSession",
  ],
  endpoints: (builder) => ({
    // --- Auth ---
    login: builder.mutation<{ user: AuthUserDTO }, { email: string; password: string }>({
      query: (body) => ({ url: "auth/login", method: "POST", body }),
      invalidatesTags: ["Auth"],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "auth/logout", method: "POST" }),
      invalidatesTags: ["Auth"],
    }),
    me: builder.query<{ user: AuthUserDTO }, void>({
      query: () => "auth/me",
      providesTags: ["Auth"],
    }),

    // --- Movies ---
    getMovies: builder.query<MovieDTO[], void>({
      query: () => "movies",
      transformResponse: (res: { movies: MovieDTO[] }) => res.movies,
      providesTags: (result) =>
        result
          ? [...result.map((m) => ({ type: "Movie" as const, id: m.id })), { type: "Movie" as const, id: "LIST" }]
          : [{ type: "Movie" as const, id: "LIST" }],
    }),
    createMovie: builder.mutation<MovieDTO, MovieInput>({
      query: (body) => ({ url: "movies", method: "POST", body }),
      transformResponse: (res: { movie: MovieDTO }) => res.movie,
      invalidatesTags: [{ type: "Movie", id: "LIST" }],
    }),
    updateMovie: builder.mutation<MovieDTO, { id: string; body: MovieInput }>({
      query: ({ id, body }) => ({ url: `movies/${id}`, method: "PUT", body }),
      transformResponse: (res: { movie: MovieDTO }) => res.movie,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Movie", id }, { type: "Movie", id: "LIST" }],
    }),
    deleteMovie: builder.mutation<void, string>({
      query: (id) => ({ url: `movies/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Movie", id: "LIST" }],
    }),
    searchExternalMovies: builder.query<{ results: ExternalMovieSearchResultDTO[] }, string>({
      query: (query) => ({ url: "external-movies/search", params: { query } }),
    }),
    importExternalMovie: builder.mutation<{ movie: MovieDTO }, { externalId: string }>({
      query: (body) => ({ url: "external-movies/import", method: "POST", body }),
      invalidatesTags: [{ type: "Movie", id: "LIST" }],
    }),
    // Resolves a curated list of ~65 well-known real titles through OMDb
    // in one request — see apps/api's data/curatedMovieTitles.ts. This
    // exists because OMDb (unlike TMDB) has no "trending"/"now playing"
    // discovery endpoint, only exact lookups, so there's no free way to
    // ask it "what's popular right now" — this is the practical
    // approximation: real data, curated selection.
    bulkImportMovies: builder.mutation<
      { importedCount: number; imported: string[]; skippedCount: number; skipped: string[] },
      void
    >({
      query: () => ({ url: "external-movies/bulk-import", method: "POST" }),
      invalidatesTags: [{ type: "Movie", id: "LIST" }],
    }),

    // --- Theatres & screens ---
    getTheatres: builder.query<TheatreWithScreens[], void>({
      query: () => "theatres",
      transformResponse: (res: { theatres: TheatreWithScreens[] }) => res.theatres,
      providesTags: (result) =>
        result
          ? [...result.map((t) => ({ type: "Theatre" as const, id: t.id })), { type: "Theatre" as const, id: "LIST" }]
          : [{ type: "Theatre" as const, id: "LIST" }],
    }),
    createTheatre: builder.mutation<TheatreDTO, TheatreInput>({
      query: (body) => ({ url: "theatres", method: "POST", body }),
      transformResponse: (res: { theatre: TheatreDTO }) => res.theatre,
      invalidatesTags: [{ type: "Theatre", id: "LIST" }],
    }),
    updateTheatre: builder.mutation<TheatreDTO, { id: string; body: TheatreInput }>({
      query: ({ id, body }) => ({ url: `theatres/${id}`, method: "PUT", body }),
      transformResponse: (res: { theatre: TheatreDTO }) => res.theatre,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Theatre", id }, { type: "Theatre", id: "LIST" }],
    }),
    deleteTheatre: builder.mutation<void, string>({
      query: (id) => ({ url: `theatres/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Theatre", id: "LIST" }],
    }),
    searchDiscoveredTheatres: builder.query<{ results: DiscoveredTheatreDTO[] }, string>({
      query: (city) => ({ url: "theatre-discovery/search", params: { city } }),
    }),
    importDiscoveredTheatre: builder.mutation<
      { theatre: TheatreWithScreens },
      { osmId: string; name: string; address: string | null; city: string; lat?: number; lon?: number }
    >({
      query: (body) => ({ url: "theatre-discovery/import", method: "POST", body }),
      invalidatesTags: [{ type: "Theatre", id: "LIST" }],
    }),
    createScreen: builder.mutation<ScreenDTO, { theatreId: string; name: string }>({
      query: ({ theatreId, name }) => ({ url: `theatres/${theatreId}/screens`, method: "POST", body: { name } }),
      transformResponse: (res: { screen: ScreenDTO }) => res.screen,
      invalidatesTags: [{ type: "Theatre", id: "LIST" }],
    }),
    deleteScreen: builder.mutation<void, { theatreId: string; screenId: string }>({
      query: ({ theatreId, screenId }) => ({ url: `theatres/${theatreId}/screens/${screenId}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Theatre", id: "LIST" }],
    }),

    // --- Seat layouts ---
    getLayout: builder.query<SeatLayoutDTO | null, string>({
      query: (screenId) => `layouts/${screenId}`,
      transformResponse: (res: { layout: SeatLayoutDTO | null }) => res.layout,
      providesTags: (_r, _e, screenId) => [{ type: "Layout", id: screenId }],
    }),
    putLayout: builder.mutation<SeatLayoutDTO, { screenId: string; seats: SeatInput[] }>({
      query: ({ screenId, seats }) => ({ url: `layouts/${screenId}`, method: "PUT", body: { seats } }),
      transformResponse: (res: { layout: SeatLayoutDTO }) => res.layout,
      invalidatesTags: (_r, _e, { screenId }) => [{ type: "Layout", id: screenId }],
    }),

    // --- Shows ---
    getShows: builder.query<ShowWithDetails[], void>({
      query: () => "shows",
      transformResponse: (res: { shows: ShowWithDetails[] }) => res.shows,
      providesTags: (result) =>
        result
          ? [...result.map((s) => ({ type: "Show" as const, id: s.id })), { type: "Show" as const, id: "LIST" }]
          : [{ type: "Show" as const, id: "LIST" }],
    }),
    createShow: builder.mutation<ShowWithDetails, ShowInput>({
      query: (body) => ({ url: "shows", method: "POST", body }),
      transformResponse: (res: { show: ShowWithDetails }) => res.show,
      invalidatesTags: [{ type: "Show", id: "LIST" }],
    }),
    deleteShow: builder.mutation<void, string>({
      query: (id) => ({ url: `shows/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Show", id: "LIST" }],
    }),
    // For every screen with no upcoming show, assigns one of the given
    // movies (round-robin) at a staggered future time — a fast way to
    // populate a schedule an admin has already decided on, not a live feed.
    autoScheduleShows: builder.mutation<
      { scheduledCount: number; screensConsidered: number },
      { movieIds: string[] }
    >({
      query: (body) => ({ url: "shows/auto-schedule", method: "POST", body }),
      invalidatesTags: [{ type: "Show", id: "LIST" }],
    }),

    // --- Events ---
    getEvents: builder.query<EventDTO[], void>({
      query: () => "events",
      transformResponse: (res: { events: EventDTO[] }) => res.events,
      providesTags: (result) =>
        result
          ? [...result.map((e) => ({ type: "Event" as const, id: e.id })), { type: "Event" as const, id: "LIST" }]
          : [{ type: "Event" as const, id: "LIST" }],
    }),
    createEvent: builder.mutation<EventDTO, EventInput>({
      query: (body) => ({ url: "events", method: "POST", body }),
      transformResponse: (res: { event: EventDTO }) => res.event,
      invalidatesTags: [{ type: "Event", id: "LIST" }],
    }),
    updateEvent: builder.mutation<EventDTO, { id: string; body: EventInput }>({
      query: ({ id, body }) => ({ url: `events/${id}`, method: "PUT", body }),
      transformResponse: (res: { event: EventDTO }) => res.event,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Event", id }, { type: "Event", id: "LIST" }],
    }),
    deleteEvent: builder.mutation<void, string>({
      query: (id) => ({ url: `events/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Event", id: "LIST" }],
    }),

    // --- Event sessions ---
    getEventSessions: builder.query<EventSessionWithDetails[], void>({
      query: () => "event-sessions",
      transformResponse: (res: { sessions: EventSessionWithDetails[] }) => res.sessions,
      providesTags: (result) =>
        result
          ? [
              ...result.map((s) => ({ type: "EventSession" as const, id: s.id })),
              { type: "EventSession" as const, id: "LIST" },
            ]
          : [{ type: "EventSession" as const, id: "LIST" }],
    }),
    createEventSession: builder.mutation<EventSessionWithDetails, EventSessionInput>({
      query: (body) => ({ url: "event-sessions", method: "POST", body }),
      transformResponse: (res: { session: EventSessionWithDetails }) => res.session,
      invalidatesTags: [{ type: "EventSession", id: "LIST" }],
    }),
    deleteEventSession: builder.mutation<void, string>({
      query: (id) => ({ url: `event-sessions/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "EventSession", id: "LIST" }],
    }),

    // --- Bookings ---
    getBookings: builder.query<BookingWithEmail[], { reference?: string; email?: string; showId?: string }>({
      query: (params) => ({ url: "bookings", params }),
      transformResponse: (res: { bookings: BookingWithEmail[] }) => res.bookings,
      providesTags: [{ type: "Booking", id: "LIST" }],
    }),

    // --- Ratings ---
    getRatings: builder.query<RatingWithMovie[], void>({
      query: () => "ratings",
      transformResponse: (res: { ratings: RatingWithMovie[] }) => res.ratings,
      providesTags: (result) =>
        result
          ? [...result.map((r) => ({ type: "Rating" as const, id: r.id })), { type: "Rating" as const, id: "LIST" }]
          : [{ type: "Rating" as const, id: "LIST" }],
    }),
    deleteRating: builder.mutation<void, string>({
      query: (id) => ({ url: `ratings/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Rating", id: "LIST" }],
    }),

    // --- Coupons ---
    getCoupons: builder.query<CouponDTO[], void>({
      query: () => "coupons",
      transformResponse: (res: { coupons: CouponDTO[] }) => res.coupons,
      providesTags: (result) =>
        result
          ? [...result.map((c) => ({ type: "Coupon" as const, id: c.id })), { type: "Coupon" as const, id: "LIST" }]
          : [{ type: "Coupon" as const, id: "LIST" }],
    }),
    createCoupon: builder.mutation<CouponDTO, CouponInput>({
      query: (body) => ({ url: "coupons", method: "POST", body }),
      transformResponse: (res: { coupon: CouponDTO }) => res.coupon,
      invalidatesTags: [{ type: "Coupon", id: "LIST" }],
    }),
    updateCoupon: builder.mutation<CouponDTO, { id: string; body: CouponInput }>({
      query: ({ id, body }) => ({ url: `coupons/${id}`, method: "PUT", body }),
      transformResponse: (res: { coupon: CouponDTO }) => res.coupon,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Coupon", id }, { type: "Coupon", id: "LIST" }],
    }),
    deleteCoupon: builder.mutation<void, string>({
      query: (id) => ({ url: `coupons/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Coupon", id: "LIST" }],
    }),

    // --- Food items ---
    getFoodItems: builder.query<FoodItemDTO[], void>({
      query: () => "food-items",
      transformResponse: (res: { foodItems: FoodItemDTO[] }) => res.foodItems,
      providesTags: (result) =>
        result
          ? [...result.map((f) => ({ type: "FoodItem" as const, id: f.id })), { type: "FoodItem" as const, id: "LIST" }]
          : [{ type: "FoodItem" as const, id: "LIST" }],
    }),
    createFoodItem: builder.mutation<FoodItemDTO, FoodItemInput>({
      query: (body) => ({ url: "food-items", method: "POST", body }),
      transformResponse: (res: { foodItem: FoodItemDTO }) => res.foodItem,
      invalidatesTags: [{ type: "FoodItem", id: "LIST" }],
    }),
    updateFoodItem: builder.mutation<FoodItemDTO, { id: string; body: FoodItemInput }>({
      query: ({ id, body }) => ({ url: `food-items/${id}`, method: "PUT", body }),
      transformResponse: (res: { foodItem: FoodItemDTO }) => res.foodItem,
      invalidatesTags: (_r, _e, { id }) => [{ type: "FoodItem", id }, { type: "FoodItem", id: "LIST" }],
    }),
    deleteFoodItem: builder.mutation<void, string>({
      query: (id) => ({ url: `food-items/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "FoodItem", id: "LIST" }],
    }),

    // --- Analytics ---
    getAnalyticsOverview: builder.query<AnalyticsOverviewDTO, { days: number }>({
      query: ({ days }) => `analytics/overview?days=${days}`,
    }),

    // --- Gift cards (read-only) ---
    getGiftCards: builder.query<GiftCardDTO[], void>({
      query: () => "gift-cards",
      transformResponse: (res: { giftCards: GiftCardDTO[] }) => res.giftCards,
    }),
  }),
});

export const {
  useLoginMutation,
  useLogoutMutation,
  useMeQuery,
  useGetMoviesQuery,
  useCreateMovieMutation,
  useUpdateMovieMutation,
  useDeleteMovieMutation,
  useLazySearchExternalMoviesQuery,
  useImportExternalMovieMutation,
  useBulkImportMoviesMutation,
  useGetTheatresQuery,
  useCreateTheatreMutation,
  useUpdateTheatreMutation,
  useDeleteTheatreMutation,
  useLazySearchDiscoveredTheatresQuery,
  useImportDiscoveredTheatreMutation,
  useCreateScreenMutation,
  useDeleteScreenMutation,
  useGetLayoutQuery,
  usePutLayoutMutation,
  useGetShowsQuery,
  useCreateShowMutation,
  useDeleteShowMutation,
  useAutoScheduleShowsMutation,
  useGetBookingsQuery,
  useLazyGetBookingsQuery,
  useGetRatingsQuery,
  useDeleteRatingMutation,
  useGetCouponsQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useDeleteCouponMutation,
  useGetFoodItemsQuery,
  useCreateFoodItemMutation,
  useUpdateFoodItemMutation,
  useDeleteFoodItemMutation,
  useGetAnalyticsOverviewQuery,
  useGetGiftCardsQuery,
  useGetEventsQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  useGetEventSessionsQuery,
  useCreateEventSessionMutation,
  useDeleteEventSessionMutation,
} = adminApi;
