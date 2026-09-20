import { Box, Typography, Stack } from "@mui/material";

export function TermsPage() {
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h4" gutterBottom>
        Terms of Service
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Standard, generic terms for a ticketing platform. ShowTime is a demo project; these
        terms describe how the product behaves, not a binding legal agreement with a registered
        company.
      </Typography>

      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Bookings
          </Typography>
          <Typography variant="body1" color="text.secondary">
            When you select seats, they're held for you for a short window while you complete
            checkout. If checkout isn't finished before the hold expires, the seats are released
            back for other customers to select. A booking is only confirmed once payment succeeds
            (or, if the order is fully covered by wallet balance, once the order is placed) and
            you receive a booking reference and e-ticket.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Guest checkout
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You can complete a booking without creating an account. Guest bookings are tracked by
            an anonymous session identifier and can be looked up later using your booking
            reference and email via "Find Booking."
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Coupons and wallet credit
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Coupon codes are subject to the terms shown at checkout (validity window, usage
            limits, minimum order value). Wallet credit can be applied toward an order's total and
            is funded by cancellation refunds, referral bonuses, or admin adjustments — it has no
            cash withdrawal value outside the platform.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Account responsibilities
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You're responsible for keeping your account credentials secure and for the accuracy
            of the details you provide (including your email address, which is used for booking
            confirmations and verification).
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
