import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import AuthGate from "./components/AuthGate";
import LoginPage from "./pages/LoginPage";
import MoviesPage from "./pages/MoviesPage";
import TheatresPage from "./pages/TheatresPage";
import LayoutEditorPage from "./pages/LayoutEditorPage";
import ShowsPage from "./pages/ShowsPage";
import EventsPage from "./pages/EventsPage";
import EventSessionsPage from "./pages/EventSessionsPage";
import BookingsPage from "./pages/BookingsPage";
import RatingsPage from "./pages/RatingsPage";
import CouponsPage from "./pages/CouponsPage";
import FoodItemsPage from "./pages/FoodItemsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import GiftCardsPage from "./pages/GiftCardsPage";

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
