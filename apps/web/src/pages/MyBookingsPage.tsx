import { useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import { useGetMyBookingsQuery, useCancelBookingMutation } from "../store/api";
import { useAppDispatch } from "../store/hooks";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";
import { TicketQRCode } from "../components/TicketQRCode";
import { downloadTicketPdf } from "../lib/downloadTicketPdf";
import type { BookingDTO } from "@showtime/shared";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
// Confirmed bookings default to expanded (ticket visible) for the most
// recent few — the whole point of this page is "show me my ticket", not
// "show me a reference code behind a button". Older confirmed bookings
// collapse into an Accordion so a long history doesn't turn into a wall of
// QR codes, but the ticket is always one click away, never hidden in a
// separate dialog.
const EXPANDED_BY_DEFAULT_COUNT = 3;

export function MyBookingsPage() {
  useDocumentTitle("My Bookings");
  const { data: bookings, isLoading, isError, error } = useGetMyBookingsQuery();
  const [cancelBooking, { isLoading: isCancelling }] =
    useCancelBookingMutation();
  const dispatch = useAppDispatch();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Holds the booking pending cancellation confirmation (or null when the
  // dialog is closed) — a booking is real money and real seats given back
  // to the pool, so an accidental misclick shouldn't be able to cancel it
  // with no chance to back out.
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const ticketRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleDownloadPdf = (booking: BookingDTO) => {
    const ref = { current: ticketRefs.current.get(booking.id) ?? null };
    downloadTicketPdf(ref, `ticket-${booking.reference}.pdf`);
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelBooking(id).unwrap();
      dispatch(
        showToast({ message: "Booking cancelled", severity: "success" }),
      );
    } catch (err) {
      dispatch(
        showToast({ message: getErrorMessage(err as any), severity: "error" }),
      );
    } finally {
      setPendingCancelId(null);
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError) {
    return <Alert severity="error">{getErrorMessage(error as any)}</Alert>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        My Bookings
      </Typography>
      {bookings?.length === 0 && (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            px: 2,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 3,
          }}
        >
          <ConfirmationNumberIcon
            sx={{ fontSize: 48, color: "text.secondary", mb: 1 }}
          />
          <Typography variant="h6" gutterBottom>
            No bookings yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Find a movie you like and book your seats in a couple of clicks.
          </Typography>
          <Button component={RouterLink} to="/" variant="contained">
            Browse movies
          </Button>
        </Box>
      )}
      <Stack spacing={2}>
        {bookings?.map((booking, index) => {
          const isConfirmed = booking.status === "CONFIRMED";
          const expanded =
            isConfirmed &&
            !(collapsed[booking.id] ?? index >= EXPANDED_BY_DEFAULT_COUNT);
          const meta = (
            <Box sx={{ width: "100%" }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
              >
                <Box>
                  <Typography variant="h6">{booking.movieTitle}</Typography>
                  <Typography color="text.secondary">
                    {booking.theatreName} · {booking.screenName} ·{" "}
                    {new Date(booking.showStartTime).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Typography>
                </Box>
                <Chip
                  label={booking.status}
                  size="small"
                  color={
                    booking.status === "CONFIRMED"
                      ? "success"
                      : booking.status === "CANCELLED"
                        ? "default"
                        : "error"
                  }
                />
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ my: 1 }}>
                {booking.seats.map((seat) => (
                  <Chip
                    key={seat.seatId}
                    label={`${seat.label} (${seat.category})`}
                    size="small"
                  />
                ))}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Ref: {booking.reference} · ₹{booking.totalAmount}
              </Typography>
            </Box>
          );

          if (!isConfirmed) {
            return (
              <Card key={booking.id}>
                <CardContent>{meta}</CardContent>
              </Card>
            );
          }

          return (
            <Accordion
              key={booking.id}
              expanded={expanded}
              onChange={(_e, next) =>
                setCollapsed((c) => ({ ...c, [booking.id]: !next }))
              }
              disableGutters
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                {meta}
              </AccordionSummary>
              <AccordionDetails>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={2} alignItems="center">
                  <TicketQRCode
                    booking={booking}
                    ref={(el) => {
                      if (el) ticketRefs.current.set(booking.id, el);
                      else ticketRefs.current.delete(booking.id);
                    }}
                  />
                  <Stack direction="row" spacing={2}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleDownloadPdf(booking)}
                    >
                      Download PDF
                    </Button>
                    <Button
                      color="error"
                      size="small"
                      disabled={isCancelling}
                      onClick={() => setPendingCancelId(booking.id)}
                    >
                      Cancel booking
                    </Button>
                  </Stack>
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>

      <Dialog
        open={pendingCancelId !== null}
        onClose={() => setPendingCancelId(null)}
      >
        <DialogTitle>Cancel this booking?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This frees your seats back up for anyone else to book — it can't be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingCancelId(null)}>Keep booking</Button>
          <Button
            color="error"
            variant="contained"
            disabled={isCancelling}
            onClick={() => pendingCancelId && handleCancel(pendingCancelId)}
          >
            {isCancelling ? "Cancelling…" : "Cancel booking"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
