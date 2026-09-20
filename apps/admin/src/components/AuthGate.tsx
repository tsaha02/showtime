import { useEffect } from "react";
import { CircularProgress, Box } from "@mui/material";
import { Navigate } from "react-router-dom";
import { useMeQuery } from "../store/adminApi";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setUser, setUnauthenticated, setLoading } from "../store/authSlice";

// Wraps the authenticated part of the app. Runs GET /auth/me once on
// mount; a 401/403 means the cookie is missing/invalid/not-admin, so we
// redirect to /login rather than rendering anything behind the gate.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);
  const { data, error, isLoading, isUninitialized } = useMeQuery();

  useEffect(() => {
    if (isLoading || isUninitialized) {
      dispatch(setLoading());
    } else if (data) {
      dispatch(setUser(data.user));
    } else if (error) {
      dispatch(setUnauthenticated());
    }
  }, [data, error, isLoading, isUninitialized, dispatch]);

  if (status === "idle" || status === "loading") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
