import { useState } from "react";
import { Box, Paper, TextField, Button, Typography, Alert } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useLoginMutation } from "../store/adminApi";
import { useAppDispatch } from "../store/hooks";
import { setUser } from "../store/authSlice";
import { extractErrorMessage } from "../lib/errors";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@showtime.dev");
  const [password, setPassword] = useState("");
  const [login, { isLoading }] = useLoginMutation();
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await login({ email, password }).unwrap();
      dispatch(setUser(res.user));
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <Paper sx={{ p: 4, width: 360 }} component="form" onSubmit={handleSubmit}>
        <Typography variant="h5" sx={{ mb: 3 }}>
          ShowTime Admin
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label="Email"
          type="email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Password"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </Paper>
    </Box>
  );
}
