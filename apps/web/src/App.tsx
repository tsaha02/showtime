import { useEffect, Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Container, Box, CircularProgress } from "@mui/material";
import { NavBar } from "./components/NavBar";
import { GlobalToast } from "./components/GlobalToast";
import { Footer } from "./components/Footer";
import { RequireAuth } from "./components/RequireAuth";
import { useAppDispatch } from "./store/hooks";
import { useGetMeQuery } from "./store/api";
import { setUser, clearUser } from "./store/slices/authSlice";

// Every page is a separate chunk, fetched only when its route is
// actually visited, instead of one large bundle shipping all ~24 pages
// (including admin-scale ones like SeatMapPage's Stripe Elements code
// and the ticket-PDF pipeline) up front — this is what actually moves
// initial load time and Lighthouse's "Largest Contentful Paint"/"Total
// Blocking Time" scores for a first-time visitor, who overwhelmingly
// lands on exactly one of these routes, not all of them at once.
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const MovieDetailPage = lazy(() => import("./pages/MovieDetailPage").then((m) => ({ default: m.MovieDetailPage })));
const EventsPage = lazy(() => import("./pages/EventsPage").then((m) => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import("./pages/EventDetailPage").then((m) => ({ default: m.EventDetailPage })));
const SearchMoviesPage = lazy(() => import("./pages/SearchMoviesPage").then((m) => ({ default: m.SearchMoviesPage })));
const DiscoverDetailPage = lazy(() =>
  import("./pages/DiscoverDetailPage").then((m) => ({ default: m.DiscoverDetailPage })),
);
const SeatMapPage = lazy(() => import("./pages/SeatMapPage").then((m) => ({ default: m.SeatMapPage })));
const FindBookingPage = lazy(() => import("./pages/FindBookingPage").then((m) => ({ default: m.FindBookingPage })));
const MyBookingsPage = lazy(() => import("./pages/MyBookingsPage").then((m) => ({ default: m.MyBookingsPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((m) => ({ default: m.ContactPage })));
const TermsPage = lazy(() => import("./pages/TermsPage").then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })));
const RefundPolicyPage = lazy(() =>
  import("./pages/RefundPolicyPage").then((m) => ({ default: m.RefundPolicyPage })),
);
const GiftCardsPage = lazy(() => import("./pages/GiftCardsPage").then((m) => ({ default: m.GiftCardsPage })));
const OffersPage = lazy(() => import("./pages/OffersPage").then((m) => ({ default: m.OffersPage })));

function RouteFallback() {
  return (
    <Box display="flex" justifyContent="center" py={8}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  const dispatch = useAppDispatch();
  // `me` is fetched once on app boot to discover whether the httpOnly
  // customer cookie is still valid; a 401 here is an expected "logged out"
  // state, not an error to surface to the user.
  const { data: user, isSuccess, isError } = useGetMeQuery();

  useEffect(() => {
    if (isSuccess) dispatch(setUser(user ?? null));
    else if (isError) dispatch(clearUser());
  }, [isSuccess, isError, user, dispatch]);

  return (
    <>
      <NavBar />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/movies/:id" element={<MovieDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/search-movies" element={<SearchMoviesPage />} />
            <Route path="/discover/:externalId" element={<DiscoverDetailPage />} />
            <Route path="/shows/:showId/seats" element={<SeatMapPage />} />
            <Route path="/checkout/find-booking" element={<FindBookingPage />} />
            <Route
              path="/my-bookings"
              element={
                <RequireAuth>
                  <MyBookingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />
            <Route path="/gift-cards" element={<GiftCardsPage />} />
            <Route path="/offers" element={<OffersPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </Container>
      <Footer />
      <GlobalToast />
    </>
  );
}
