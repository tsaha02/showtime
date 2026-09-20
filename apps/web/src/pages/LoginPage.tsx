import { useState, type FormEvent } from "react";
import {
  useNavigate,
  useLocation,
  Link as RouterLink,
  type Location,
} from "react-router-dom";
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  Stack,
  Link,
} from "@mui/material";
import { useLoginMutation } from "../store/api";
import { useAppDispatch } from "../store/hooks";
import { setUser } from "../store/slices/authSlice";
import { getErrorMessage } from "../lib/apiError";
import { AuthPageLayout } from "../components/AuthPageLayout";
import { PasswordField } from "../components/PasswordField";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
export function LoginPage() {
  useDocumentTitle("Log In");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Mirrors loginSchema: valid email, non-empty password. The server is
    // still the source of truth for "is this actually a valid account" —
    // this is just fast feedback before round-tripping to it.
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFormError("Enter a valid email address");
      return;
    }
    if (password.length < 1) {
      setFormError("Password is required");
      return;
    }

    try {
      const user = await login({ email, password }).unwrap();
      dispatch(setUser(user));
      const from = (location.state as { from?: Location } | null)?.from;
      navigate(from ? from.pathname : "/", { replace: true });
    } catch {
      // error surfaced below via the mutation's `error`
    }
  };

  return (
    <AuthPageLayout>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%" }}>
        <Typography variant="h5" gutterBottom>
          Log in
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2} mt={1}>
            {(formError || error) && (
              <Alert severity="error">
                {formError ?? getErrorMessage(error as any)}
              </Alert>
            )}
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
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
            >
              {isLoading ? "Logging in…" : "Log in"}
            </Button>
            <Typography variant="body2">
              <Link component={RouterLink} to="/forgot-password">
                Forgot password?
              </Link>
            </Typography>
            <Typography variant="body2">
              No account?{" "}
              <Link component={RouterLink} to="/register">
                Sign up
              </Link>
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </AuthPageLayout>
  );
}
