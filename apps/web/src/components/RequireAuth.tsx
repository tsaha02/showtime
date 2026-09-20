import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "../store/hooks";

// Route guard for pages that require a logged-in customer (e.g. /my-bookings).
// `authBooted` (set once the initial GET /auth/me resolves, see App.tsx)
// avoids a flash-redirect to /login before we even know whether a session
// cookie is valid.
export function RequireAuth({ children }: { children: ReactElement }) {
  const user = useAppSelector((s) => s.auth.user);
  const booted = useAppSelector((s) => s.auth.status === "idle");
  const location = useLocation();

  if (!booted) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
