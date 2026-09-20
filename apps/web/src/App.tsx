import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Container } from "@mui/material";
import { NavBar } from "./components/NavBar";
import { GlobalToast } from "./components/GlobalToast";
import { Footer } from "./components/Footer";
import { RequireAuth } from "./components/RequireAuth";
import { useAppDispatch } from "./store/hooks";
import { useGetMeQuery } from "./store/api";
import { setUser, clearUser } from "./store/slices/authSlice";

import { HomePage } from "./pages/HomePage";
import { MovieDetailPage } from "./pages/MovieDetailPage";
import { EventsPage } from "./pages/EventsPage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { SearchMoviesPage } from "./pages/SearchMoviesPage";
import { DiscoverDetailPage } from "./pages/DiscoverDetailPage";
import { SeatMapPage } from "./pages/SeatMapPage";
import { FindBookingPage } from "./pages/FindBookingPage";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AboutPage } from "./pages/AboutPage";
import { ContactPage } from "./pages/ContactPage";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RefundPolicyPage } from "./pages/RefundPolicyPage";
import { GiftCardsPage } from "./pages/GiftCardsPage";
import { OffersPage } from "./pages/OffersPage";

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
      </Container>
      <Footer />
      <GlobalToast />
    </>
  );
}
