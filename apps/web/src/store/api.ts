import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  MovieDTO,
  ShowDTO,
  TheatreDTO,
  RatingDTO,
  RatingsPageDTO,
  BookingDTO,
  AuthUserDTO,
  SeatMapResponseDTO,
  ConfirmBookingInput,
  CreatePaymentIntentInput,
  CreatePaymentIntentResponseDTO,
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
} from "@showtime/shared";
import { getSessionId } from "../lib/sessionId";

export type SeatMapResponse = SeatMapResponseDTO;

// A single RTK Query slice for every read/write against apps/api. Tag-based
// cache invalidation keeps things simple: e.g. confirming a booking
// invalidates "MyBookings" so the my-bookings list refetches, instead of us
// having to manually patch the cache after every mutation.
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
    credentials: "include",
    prepareHeaders: (headers) => {
      headers.set("x-session-id", getSessionId());
      return headers;
    },
  }),
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
    getMovieShows: builder.query<ShowDTO[], { movieId: string; city?: string }>({
      query: ({ movieId, city }) => ({ url: `/movies/${movieId}/shows`, params: city ? { city } : undefined }),
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
  useConfirmBookingMutation,
  useGetMyBookingsQuery,
  useFindBookingMutation,
  useCancelBookingMutation,
  useCreateRatingMutation,
} = api;
