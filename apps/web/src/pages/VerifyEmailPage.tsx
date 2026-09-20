import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, TextField, Button, Typography, Paper, Alert, Stack, Link } from "@mui/material";
import { useVerifyEmailMutation, useResendOtpMutation } from "../store/api";
import { useAppSelector } from "../store/hooks";
import { getErrorMessage } from "../lib/apiError";
import { AuthPageLayout } from "../components/AuthPageLayout";

const RESEND_COOLDOWN_SECONDS = 30;

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  // The email to verify comes from wherever the user got here: right after
  // registering (passed via router state) or later from a "Verify your
  // email" link elsewhere in the app, in which case we fall back to the
  // logged-in user's own email from authSlice.
  const email = (location.state as { email?: string } | null)?.email ?? user?.email ?? "";

  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifyEmail, { isLoading: isVerifying, error: verifyError }] = useVerifyEmailMutation();
  const [resendOtp, { isLoading: isResending }] = useResendOtpMutation();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\d{6}$/.test(otp)) {
      setFormError("Enter the 6-digit code");
      return;
    }

    try {
      await verifyEmail({ email, otp }).unwrap();
      setVerified(true);
    } catch {
      // error surfaced below via the mutation's `error`
    }
  };

  const handleResend = async () => {
    await resendOtp({ email });
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  if (!email) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <Alert severity="warning">
          No email to verify.{" "}
          <Link component={RouterLink} to="/register">
            Sign up
          </Link>{" "}
          or{" "}
          <Link component={RouterLink} to="/login">
            log in
          </Link>{" "}
          first.
        </Alert>
      </Box>
    );
  }

  return (
    <AuthPageLayout>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%" }}>
        <Typography variant="h5" gutterBottom>
          Verify your email
        </Typography>
        {verified ? (
          <Stack spacing={2} mt={1}>
            <Alert severity="success">Your email is verified.</Alert>
            <Button variant="contained" size="large" onClick={() => navigate("/", { replace: true })}>
              Continue to app
            </Button>
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2} mt={1}>
              <Typography color="text.secondary">We sent a 6-digit code to {email}.</Typography>
              {(formError || verifyError) && (
                <Alert severity="error">{formError ?? getErrorMessage(verifyError as any)}</Alert>
              )}
              <TextField
                label="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputProps={{ inputMode: "numeric", maxLength: 6 }}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={isVerifying}>
                {isVerifying ? "Verifying…" : "Verify"}
              </Button>
              <Button disabled={isResending || cooldown > 0} onClick={handleResend}>
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </Button>
              <Button color="inherit" onClick={() => navigate("/", { replace: true })}>
                Skip for now
              </Button>
            </Stack>
          </Box>
        )}
      </Paper>
    </AuthPageLayout>
  );
}
