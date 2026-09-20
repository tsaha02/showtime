import { useState, type FormEvent } from "react";
import {
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  Alert,
} from "@mui/material";
import { useAppDispatch } from "../store/hooks";
import { showToast } from "../store/slices/uiSlice";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
export function ContactPage() {
  useDocumentTitle("Contact");
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    dispatch(
      showToast({
        message: "Demo project — this form isn't connected to a real inbox.",
        severity: "info",
      }),
    );
    setName("");
    setEmail("");
    setMessage("");
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h4" gutterBottom>
        Contact
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
        Questions about the project? Reach out at{" "}
        <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
          support@showtime.dev
        </Box>
        .
      </Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        This is a demo project — no live support desk is staffed, but the form
        below is wired for real (client-side validation and all), it just
        doesn't send anywhere.
      </Alert>
      <Stack component="form" onSubmit={handleSubmit} spacing={2}>
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          fullWidth
          multiline
          minRows={4}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          sx={{ alignSelf: "flex-start" }}
        >
          Send message
        </Button>
      </Stack>
    </Box>
  );
}
