import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type Severity = "success" | "error" | "info" | "warning";

interface ToastState {
  message: string | null;
  severity: Severity;
}

// Single-slot toast (not a queue) — good enough for this app since we never
// need to show two error messages at once, and it keeps the snackbar
// component trivial (one open/close boolean derived from `message`).
const initialState: ToastState = {
  message: null,
  severity: "info",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    showToast(state, action: PayloadAction<{ message: string; severity?: Severity }>) {
      state.message = action.payload.message;
      state.severity = action.payload.severity ?? "info";
    },
    clearToast(state) {
      state.message = null;
    },
  },
});

export const { showToast, clearToast } = uiSlice.actions;
export default uiSlice.reducer;
