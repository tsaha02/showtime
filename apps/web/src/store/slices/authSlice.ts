import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthUserDTO } from "@showtime/shared";

interface AuthState {
  user: AuthUserDTO | null;
  status: "idle" | "loading";
}

// Starts "loading" because the app always kicks off a GET /auth/me on boot
// to check for an existing session cookie; route guards (RequireAuth) wait
// for this to resolve to "idle" before deciding whether to redirect, so a
// logged-in user reloading a protected page doesn't get flash-redirected
// to /login while the cookie check is still in flight.
const initialState: AuthState = {
  user: null,
  status: "loading",
};

// Auth is hand-written (not derived purely from RTK Query cache) because we
// want a single, cheap-to-read `state.auth.user` for things like route
// guards and "am I logged in" checks in the booking flow, without every
// consumer needing to know about the `getMe` query's cache key. Login,
// register, and the initial `me` fetch all funnel their result in here via
// `setUser` from a `useEffect`/`onQueryStarted` in the component/hook that
// calls them.
const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUserDTO | null>) {
      state.user = action.payload;
      state.status = "idle";
    },
    setAuthLoading(state) {
      state.status = "loading";
    },
    clearUser(state) {
      state.user = null;
      state.status = "idle";
    },
  },
});

export const { setUser, setAuthLoading, clearUser } = authSlice.actions;
export default authSlice.reducer;
