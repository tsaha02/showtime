import { useEffect } from "react";
import { Box, Skeleton, Stack } from "@mui/material";
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
    // This wraps the whole admin app on first load, so match the real
    // logged-in shell at a glance (see AdminLayout.tsx) — a sidebar-shaped
    // block plus a content-area skeleton, not a spinner alone on a blank
    // page.
    return (
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <Box
          sx={{
            width: 232,
            flexShrink: 0,
            display: { xs: "none", md: "block" },
            borderRight: "1px solid",
            borderColor: "divider",
            p: 2.5,
          }}
        >
          <Skeleton variant="text" width="60%" height={32} sx={{ mb: 3 }} />
          <Stack spacing={1.5}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={36} />
            ))}
          </Stack>
        </Box>
        <Box sx={{ flexGrow: 1, p: 3 }}>
          <Skeleton variant="text" width={200} height={44} sx={{ mb: 3 }} />
          <Stack spacing={1.5}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} />
            ))}
          </Stack>
        </Box>
      </Box>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
