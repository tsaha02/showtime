import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import AuthGate from "./components/AuthGate";
import LoginPage from "./pages/LoginPage";
import MoviesPage from "./pages/MoviesPage";
import TheatresPage from "./pages/TheatresPage";
import LayoutEditorPage from "./pages/LayoutEditorPage";
import ShowsPage from "./pages/ShowsPage";
import BookingsPage from "./pages/BookingsPage";
import RatingsPage from "./pages/RatingsPage";

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
          <Route path="/" element={<Navigate to="/movies" replace />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/theatres" element={<TheatresPage />} />
          <Route path="/theatres/:theatreId/screens/:screenId/layout" element={<LayoutEditorPage />} />
          <Route path="/shows" element={<ShowsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/ratings" element={<RatingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
