import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import authReducer from "./slices/authSlice";
import bookingReducer from "./slices/bookingSlice";
import uiReducer from "./slices/uiSlice";
import locationReducer from "./slices/locationSlice";

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    booking: bookingReducer,
    ui: uiReducer,
    location: locationReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
