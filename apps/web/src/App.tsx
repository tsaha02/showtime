import { useEffect, Suspense, lazy } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Container, Box, Grid, Skeleton } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { NavBar } from "./components/NavBar";
import { GlobalToast } from "./components/GlobalToast";
import { Footer } from "./components/Footer";
import { RequireAuth } from "./components/RequireAuth";
import { EnableNotificationsBanner } from "./components/EnableNotificationsBanner";
import { useAppDispatch } from "./store/hooks";
import { useGetMeQuery } from "./store/api";
import { setUser, clearUser } from "./store/slices/authSlice";
import { usePrefersReducedMotion } from "./lib/motion";

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

// Floating booking-assistant widget, mounted globally below — lazy-loaded
// like every page above so its code (and the chat-bubble rendering logic)
// isn't in the initial bundle for visitors who never open it.
const ChatWidget = lazy(() => import("./components/ChatWidget").then((m) => ({ default: m.ChatWidget })));

// Generic scaffold used as the Suspense fallback for every lazy-loaded
// route — it can't know the real shape of whichever page is loading, so it
// approximates a typical page (a heading, then a row of card-shaped
// blocks) rather than a spinner that gets replaced by a completely
// different layout. It renders inside the same <Container> the real pages
// mount into (see below), so there's no padding/width jump when the real
// page swaps in.
function RouteFallback() {
  return (
    <Box>
      <Skeleton variant="text" width={220} height={48} sx={{ mb: 3 }} />
      <Grid container spacing={3}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Grid item xs={12} sm={6} md={4} key={i}>
            <Skeleton variant="rounded" height={180} sx={{ borderRadius: 2, mb: 1 }} />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="40%" />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// Framer's docs pattern for combining `AnimatePresence` with React Router
// v6: key the exiting/entering element on `location.pathname` and pass an
// explicit `location` prop down to `<Routes>` so it renders the OLD route's
// element while `AnimatePresence` plays the exit animation, rather than
// snapping straight to the new route before the exit finishes. `mode="wait"`
// keeps it to one page on screen at a time (a plain cross-fade, not the new
// page sliding in underneath/over the old one) — deliberately kept to a
// short 180ms + tiny 8px offset so it reads as "polished," not "slow." This
// sits INSIDE the existing `<Suspense>` boundary, unchanged otherwise: a
// route whose chunk isn't loaded yet still suspends to `RouteFallback` as
// before (no animated exit for that specific case, since the whole subtree
// suspends rather than unmounting normally) — an accepted tradeoff, not a
// regression, since that fallback swap was already instant pre-existing
// behavior.
function AnimatedRoutes() {
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();

  // React Router (unlike a traditional multi-page site) never resets
  // scroll position on navigation by itself — the browser has no reason
  // to, since no real page load happens. Without this, clicking from a
  // movie you scrolled deep into straight to a new page landed the
  // visitor wherever THAT scroll position happened to be, not the top of
  // the new page. Keyed on `pathname` only (not the full location), so
  // an in-place filter/query-param change on the SAME page — HomePage's
  // search/genre/city filters, for instance — doesn't yank scroll back
  // to the top while someone's still looking at the results below.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <Routes location={location}>
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
      </motion.div>
    </AnimatePresence>
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
      <EnableNotificationsBanner />
      <Container maxWidth="lg" sx={{ pt: 3, pb: 4 }}>
        <Suspense fallback={<RouteFallback />}>
          <AnimatedRoutes />
        </Suspense>
      </Container>
      <Footer />
      <GlobalToast />
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
    </>
  );
}
