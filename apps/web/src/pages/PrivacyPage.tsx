import { Box, Typography, Stack } from "@mui/material";

export function PrivacyPage() {
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h4" gutterBottom>
        Privacy Policy
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This is a generic privacy policy describing how ShowTime, as a demo project, handles the
        information it collects.
      </Typography>

      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" gutterBottom>
            What we collect
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Account details you provide (name, email, password), booking details (movie,
            showtime, seats, food add-ons), and payment metadata needed to process a charge
            through our payment processor (Stripe). We do not store your card number ourselves —
            card data is handled directly by Stripe.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            How it's used
          </Typography>
          <Typography variant="body1" color="text.secondary">
            To create and manage bookings, send booking confirmations and email verification
            links, apply coupons and wallet credit, and let you look up guest bookings by
            reference and email.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Location
          </Typography>
          <Typography variant="body1" color="text.secondary">
            If you use "Use my location" to find nearby theatres, your coordinates are sent to a
            reverse-geocoding lookup only to resolve a city name — they are not stored.
          </Typography>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Data retention
          </Typography>
          <Typography variant="body1" color="text.secondary">
            As a demo project, data may be reset periodically. We don't sell or share your data
            with third parties beyond what's required to process payments and deliver the
            service.
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
