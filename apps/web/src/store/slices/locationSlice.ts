import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const STORAGE_KEY = "showtime:selectedCity";

interface LocationState {
  city: string | null;
}

// A separate, persisted slice (rather than component-local state on
// HomePage) because the selected city needs to survive both navigation
// (Home -> MovieDetail) and a full page reload, and needs to be readable
// from anywhere in the app (currently HomePage and MovieDetailPage, but
// any future page that filters by location can read it the same way)
// without threading it through router state or query params.
function readPersistedCity(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const initialState: LocationState = {
  city: readPersistedCity(),
};

const locationSlice = createSlice({
  name: "location",
  initialState,
  reducers: {
    setSelectedCity(state, action: PayloadAction<string | null>) {
      state.city = action.payload;
      try {
        if (action.payload) {
          localStorage.setItem(STORAGE_KEY, action.payload);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // localStorage unavailable (private browsing, etc.) — in-memory
        // state still works for the rest of this session.
      }
    },
  },
});

export const { setSelectedCity } = locationSlice.actions;
export default locationSlice.reducer;
