import { useState, type FormEvent } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, TextField, Button, Typography, Paper, Alert, Stack } from "@mui/material";
import { useRegisterMutation } from "../store/api";
import { useAppDispatch } from "../store/hooks";
import { setUser } from "../store/slices/authSlice";
import { getErrorMessage } from "../lib/apiError";
import { AuthPageLayout } from "../components/AuthPageLayout";
import { PasswordField } from "../components/PasswordField";

export function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [register, { isLoading, error }] = useRegisterMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Mirrors registerSchema: name 2-100 chars, valid email, password 8-72
    // chars, confirmPassword must match.
    if (name.trim().length < 2) {
      setFormError("Name must be at least 2 characters");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    try {
      const user = await register({ name, email, password, confirmPassword }).unwrap();
      dispatch(setUser(user));
      navigate("/verify-email", { replace: true, state: { email: user.email } });
    } catch {
      // error surfaced below via the mutation's `error`
    }
  };

  return (
    <AuthPageLayout>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%" }}>
        <Typography variant="h5" gutterBottom>
          Create an account
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2} mt={1}>
            {(formError || error) && (
              <Alert severity="error">{formError ?? getErrorMessage(error as any)}</Alert>
            )}
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText="At least 8 characters"
            />
            <PasswordField
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={isLoading}>
              {isLoading ? "Creating account…" : "Sign up"}
            </Button>
            <Typography variant="body2">
              Already have an account? <RouterLink to="/login">Log in</RouterLink>
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </AuthPageLayout>
  );
}
