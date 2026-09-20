import { useState, type FormEvent } from "react";
import { Box, TextField, Button, Typography, Paper, Alert, Stack, Card, CardContent, Chip, Divider } from "@mui/material";
import { useFindBookingMutation } from "../store/api";
import { getErrorMessage } from "../lib/apiError";
import { TicketQRCode } from "../components/TicketQRCode";

export function FindBookingPage() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [findBooking, { data: booking, isLoading, error, isSuccess }] = useFindBookingMutation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await findBooking({ reference: reference.trim(), email: email.trim() }).unwrap();
    } catch {
      // error surfaced below
    }
  };

  return (
    <Box display="flex" flexDirection="column" alignItems="center" py={4}>
      <Paper sx={{ p: { xs: 3, sm: 4 }, width: "100%", maxWidth: 480, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Find my booking
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2} mt={1}>
            {error && <Alert severity="error">{getErrorMessage(error as any)}</Alert>}
            <TextField
              label="Booking reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Email used at booking"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={isLoading}>
              {isLoading ? "Searching…" : "Find booking"}
            </Button>
          </Stack>
        </Box>
      </Paper>

      {isSuccess && booking && (
        <Stack spacing={3} width="100%" maxWidth={480}>
          <Card sx={{ width: "100%" }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {booking.movieTitle}
              </Typography>
              <Typography color="text.secondary" gutterBottom>
                {booking.theatreName} · {booking.screenName} ·{" "}
                {new Date(booking.showStartTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </Typography>
              <Chip label={booking.status} size="small" color={booking.status === "CONFIRMED" ? "success" : "default"} sx={{ mb: 2 }} />
              <Stack spacing={1} sx={{ mb: 2 }}>
                {booking.seats.map((seat) => (
                  <Stack key={seat.seatId} direction="row" justifyContent="space-between">
                    <Chip label={`${seat.label} (${seat.category})`} size="small" />
                    <Typography>₹{seat.price}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="subtitle1">Total</Typography>
                <Typography variant="subtitle1">₹{booking.totalAmount}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Reference: {booking.reference}
              </Typography>
            </CardContent>
          </Card>
          {booking.status === "CONFIRMED" && <TicketQRCode booking={booking} />}
        </Stack>
      )}
    </Box>
  );
}
