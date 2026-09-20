import { useState, type FormEvent } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, TextField, Button, Typography, Paper, Alert, Stack } from "@mui/material";
import { useForgotPasswordMutation } from "../store/api";
import { AuthPageLayout } from "../components/AuthPageLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter a valid email address");
      return;
    }

    // The endpoint always returns 204 regardless of whether the account
    // exists, so there's nothing to branch on here besides a hard failure —
    // we just show the generic message either way.
    try {
      await forgotPassword({ email }).unwrap();
    } catch {
      // ignore — still show the generic message, never reveal account existence
    }
    setSent(true);
  };

  return (
    <AuthPageLayout>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%" }}>
        <Typography variant="h5" gutterBottom>
          Forgot password
        </Typography>
        {sent ? (
          <Stack spacing={2} mt={1}>
            <Alert severity="success">
              If an account exists for that email, a reset code has been sent.
            </Alert>
            <Button
              variant="contained"
              size="large"
              onClick={() => navigate("/reset-password", { state: { email } })}
            >
              I have my code
            </Button>
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2} mt={1}>
              <Typography color="text.secondary">
                Enter your account email and we'll send you a 6-digit reset code.
              </Typography>
              {formError && <Alert severity="error">{formError}</Alert>}
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={isLoading}>
                {isLoading ? "Sending…" : "Send reset code"}
              </Button>
              <Typography variant="body2">
                <RouterLink to="/login">Back to log in</RouterLink>
              </Typography>
            </Stack>
          </Box>
        )}
      </Paper>
    </AuthPageLayout>
  );
}
