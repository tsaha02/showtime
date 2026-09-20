import { Snackbar, Alert } from "@mui/material";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { clearToast } from "../store/slices/uiSlice";

// Single-slot toast fed by uiSlice.showToast — used for API errors (esp.
// 409 seat-conflict messages, which are the centerpiece of this app's UX)
// and simple confirmations like "logged out".
export function GlobalToast() {
  const { message, severity } = useAppSelector((s) => s.ui);
  const dispatch = useAppDispatch();

  return (
    <Snackbar
      open={!!message}
      autoHideDuration={5000}
      onClose={() => dispatch(clearToast())}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert onClose={() => dispatch(clearToast())} severity={severity} variant="filled" sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
