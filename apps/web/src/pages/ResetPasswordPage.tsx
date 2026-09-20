import { useState, type FormEvent } from "react";
import { useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, TextField, Button, Typography, Paper, Alert, Stack } from "@mui/material";
import { useResetPasswordMutation } from "../store/api";
import { useAppDispatch } from "../store/hooks";
import { setUser } from "../store/slices/authSlice";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";
import { AuthPageLayout } from "../components/AuthPageLayout";
import { PasswordField } from "../components/PasswordField";

export function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // The email normally arrives via router state from ForgotPasswordPage; if
  // this page is opened directly or the tab is refreshed, fall back to a
  // plain text field the user fills in themselves.
  const stateEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(stateEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [resetPassword, { isLoading, error }] = useResetPasswordMutation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Mirrors resetPasswordSchema: valid email, 6-digit otp, newPassword
    // 8-72 chars, confirmNewPassword must match.
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter a valid email address");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setFormError("Enter the 6-digit code");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setFormError("Passwords do not match");
      return;
    }

    try {
      const user = await resetPassword({ email, otp, newPassword, confirmNewPassword }).unwrap();
      dispatch(setUser(user));
      dispatch(showToast({ message: "Password reset. You're logged in.", severity: "success" }));
      navigate("/", { replace: true });
    } catch {
      // error surfaced below via the mutation's `error`
    }
  };

  return (
    <AuthPageLayout>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%" }}>
        <Typography variant="h5" gutterBottom>
          Reset password
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2} mt={1}>
            {(formError || error) && (
              <Alert severity="error">{formError ?? getErrorMessage(error as any)}</Alert>
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              disabled={!!stateEmail}
            />
            <TextField
              label="6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputProps={{ inputMode: "numeric", maxLength: 6 }}
              required
              fullWidth
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              fullWidth
              helperText="At least 8 characters"
            />
            <PasswordField
              label="Confirm new password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={isLoading}>
              {isLoading ? "Resetting…" : "Reset password"}
            </Button>
            <Typography variant="body2">
              Didn't get a code? <RouterLink to="/forgot-password">Request a new one</RouterLink>
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </AuthPageLayout>
  );
}
