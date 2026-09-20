import { Box, Typography, Stack } from "@mui/material";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
export function RefundPolicyPage() {
  useDocumentTitle("Refund & Cancellation Policy");
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h4" gutterBottom>
        Refund &amp; Cancellation Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This describes exactly how cancellations and refunds work in ShowTime
        today.
      </Typography>

      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Cancelling a booking
          </Typography>
          <Typography variant="body1" color="text.secondary">
            You can cancel any of your own confirmed bookings from "My
            Bookings." Cancelling immediately releases your seats back for other
            customers to book.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            How refunds are calculated
          </Typography>
          <Typography variant="body1" color="text.secondary">
            A refund is split by how the original order was paid. Any portion
            paid from your wallet balance is credited straight back to your
            wallet. Any portion paid in cash is refunded to your original
            payment method via Stripe when a real charge exists; if there was no
            real charge to refund (for example, a mocked payment) or the Stripe
            refund call fails, that portion is credited to your wallet instead
            so you're never left without your money back.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Seat holds
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Seats you select but don't complete checkout for are only held
            temporarily. If the hold expires before payment is confirmed, the
            seats are released automatically and no charge is made — there is
            nothing to refund in that case.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Coupons and food add-ons
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Cancelling a booking cancels the entire order, including any food &
            beverage add-ons; coupon discounts already applied simply reduce the
            amount that was charged (and therefore the amount refunded) —
            coupons themselves aren't reissued.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
