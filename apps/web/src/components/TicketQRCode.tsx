import { Box, Card, CardContent, Stack, Typography, Divider } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import type { BookingDTO } from "@showtime/shared";

interface TicketQRCodeProps {
  booking: BookingDTO;
}

// A compact plain-text payload — not a JSON blob or a deep link — so the QR
// stays scannable at small sizes and is legible even to a human squinting at
// a raw decode (e.g. in a QR reader app that just shows the text).
function buildTicketPayload(booking: BookingDTO): string {
  const showTime = new Date(booking.showStartTime).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const seatLabels = booking.seats.map((s) => s.label).join(", ");
  return [
    "ShowTime Ticket",
    `Ref: ${booking.reference}`,
    `Movie: ${booking.movieTitle}`,
    `Seats: ${seatLabels}`,
    `Show: ${showTime}`,
  ].join("\n");
}

export function TicketQRCode({ booking }: TicketQRCodeProps) {
  const payload = buildTicketPayload(booking);

  return (
    <Card
      variant="outlined"
      sx={{
        maxWidth: 320,
        width: "100%",
        height: "100%",
        display: "flex",
        borderStyle: "dashed",
        borderWidth: 2,
        borderColor: "divider",
      }}
    >
      <CardContent sx={{ width: "100%", display: "flex", alignItems: "center" }}>
        <Stack spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
          <Typography variant="subtitle1" fontWeight={600} textAlign="center">
            {booking.movieTitle}
          </Typography>
          <Box sx={{ p: 1, bgcolor: "#fff", borderRadius: 1 }}>
            <QRCodeSVG value={payload} size={148} />
          </Box>
          <Divider flexItem />
          <Stack alignItems="center" spacing={0.25}>
            <Typography variant="body2" color="text.secondary">
              Booking reference
            </Typography>
            <Typography variant="subtitle1" fontWeight={700} letterSpacing={1}>
              {booking.reference}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            {booking.seats.map((s) => s.label).join(", ")} ·{" "}
            {new Date(booking.showStartTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
