import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import AdminLayout from "./components/AdminLayout";
import AuthGate from "./components/AuthGate";
import LoginPage from "./pages/LoginPage";

// Route-level code splitting — AnalyticsPage alone pulls in `recharts`
// (a sizeable charting library used nowhere else in this app), so
// bundling every admin page into one chunk meant every admin visit paid
// for that regardless of which page they actually opened.
const MoviesPage = lazy(() => import("./pages/MoviesPage"));
const TheatresPage = lazy(() => import("./pages/TheatresPage"));
const LayoutEditorPage = lazy(() => import("./pages/LayoutEditorPage"));
const ShowsPage = lazy(() => import("./pages/ShowsPage"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const EventSessionsPage = lazy(() => import("./pages/EventSessionsPage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const RatingsPage = lazy(() => import("./pages/RatingsPage"));
const CouponsPage = lazy(() => import("./pages/CouponsPage"));
const FoodItemsPage = lazy(() => import("./pages/FoodItemsPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const GiftCardsPage = lazy(() => import("./pages/GiftCardsPage"));

function RouteFallback() {
  return (
    <Box display="flex" justifyContent="center" py={8}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <AuthGate>
                <AdminLayout />
              </AuthGate>
            }
          >
            <Route path="/" element={<Navigate to="/analytics" replace />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/theatres" element={<TheatresPage />} />
            <Route path="/theatres/:theatreId/screens/:screenId/layout" element={<LayoutEditorPage />} />
            <Route path="/shows" element={<ShowsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/event-sessions" element={<EventSessionsPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
            <Route path="/ratings" element={<RatingsPage />} />
            <Route path="/coupons" element={<CouponsPage />} />
            <Route path="/food-items" element={<FoodItemsPage />} />
            <Route path="/gift-cards" element={<GiftCardsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
