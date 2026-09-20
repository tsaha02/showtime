import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthUserDTO } from "@showtime/shared";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: AuthUserDTO | null;
  status: AuthStatus;
}

const initialState: AuthState = { user: null, status: "idle" };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUserDTO>) {
      state.user = action.payload;
      state.status = "authenticated";
    },
    setUnauthenticated(state) {
      state.user = null;
      state.status = "unauthenticated";
    },
    setLoading(state) {
      state.status = "loading";
    },
  },
});

export const { setUser, setUnauthenticated, setLoading } = authSlice.actions;
export default authSlice.reducer;
