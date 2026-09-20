import { Box, Typography, Stack } from "@mui/material";

export function AboutPage() {
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h4" gutterBottom>
        About ShowTime
      </Typography>
      <Stack spacing={2}>
        <Typography variant="body1" color="text.secondary">
          ShowTime is a movie ticket booking platform: browse what's playing, pick a seat on a
          live seat map, add snacks, and check out with a real payment flow. It's built as a
          portfolio/demo project, put together end-to-end — booking, seat locking, payments,
          coupons, a wallet, and an admin panel — to show what a production-shaped ticketing
          product looks like.
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Because it's a demo, a few things are intentionally scaled down: payments run through
          Stripe in test mode (no real money moves), and the "cities" it serves are a curated
          seed list rather than a nationwide rollout. Everything else — seat holds, race-condition
          handling on checkout, cancellations and refunds, coupons, and the food & beverage
          menu — works the way a real booking system's would.
        </Typography>
        <Typography variant="body1" color="text.secondary">
          The name "ShowTime" is the product's actual name in this project; there's no separate
          registered company behind it.
        </Typography>
      </Stack>
    </Box>
  );
}
