import { useRef, useState, type FormEvent } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  Stack,
  Card,
  CardContent,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { useFindBookingMutation, useCancelBookingMutation } from "../store/api";
import { useAppDispatch } from "../store/hooks";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";
import { TicketQRCode } from "../components/TicketQRCode";
import { downloadTicketPdf } from "../lib/downloadTicketPdf";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
export function FindBookingPage() {
  useDocumentTitle("Find My Booking");
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [findBooking, { data: booking, isLoading, error, isSuccess }] =
    useFindBookingMutation();
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();
  const dispatch = useAppDispatch();
  // A guest has no session to re-authenticate a cancel with, so this
  // page proves ownership the same way it just proved it to LOOK the
  // booking up — the email still sitting in the form field above. A
  // dialog gates it the same way MyBookingsPage's does: real seats,
  // real money, no accidental misclick.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await findBooking({
        reference: reference.trim(),
        email: email.trim(),
      }).unwrap();
    } catch {
      // error surfaced below
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    try {
      await cancelBooking({ id: booking.id, email: email.trim() }).unwrap();
      dispatch(showToast({ message: "Booking cancelled", severity: "success" }));
      // Re-run the same lookup so the card below reflects the real,
      // now-CANCELLED status instead of the stale CONFIRMED response
      // still sitting in the mutation's cache.
      await findBooking({ reference: reference.trim(), email: email.trim() }).unwrap();
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    } finally {
      setConfirmCancelOpen(false);
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
            {error && (
              <Alert severity="error">{getErrorMessage(error as any)}</Alert>
            )}
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
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
            >
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
                {new Date(booking.showStartTime).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Typography>
              <Chip
                label={booking.status}
                size="small"
                color={booking.status === "CONFIRMED" ? "success" : "default"}
                sx={{ mb: 2 }}
              />
              <Stack spacing={1} sx={{ mb: 2 }}>
                {booking.seats.map((seat) => (
                  <Stack
                    key={seat.seatId}
                    direction="row"
                    justifyContent="space-between"
                  >
                    <Chip
                      label={`${seat.label} (${seat.category})`}
                      size="small"
                    />
                    <Typography>₹{seat.price}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="subtitle1">Total</Typography>
                <Typography variant="subtitle1">
                  ₹{booking.totalAmount}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Reference: {booking.reference}
              </Typography>
            </CardContent>
          </Card>
          {booking.status === "CONFIRMED" && (
            <Stack spacing={1} alignItems="center">
              <TicketQRCode ref={ticketRef} booking={booking} />
              <Button
                size="small"
                variant="outlined"
                onClick={() =>
                  downloadTicketPdf(
                    ticketRef,
                    `ticket-${booking.reference}.pdf`,
                  )
                }
              >
                Download PDF
              </Button>
              <Button
                size="small"
                color="error"
                disabled={isCancelling}
                onClick={() => setConfirmCancelOpen(true)}
              >
                Cancel booking
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      <Dialog open={confirmCancelOpen} onClose={() => setConfirmCancelOpen(false)}>
        <DialogTitle>Cancel this booking?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This frees your seats back up for anyone else to book — it can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancelOpen(false)}>Keep booking</Button>
          <Button color="error" variant="contained" disabled={isCancelling} onClick={handleCancel}>
            {isCancelling ? "Cancelling…" : "Cancel booking"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
