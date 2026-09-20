import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Alert, AlertTitle, Button, Stack, Typography } from "@mui/material";

// Rendered inside an <Elements> provider (see SeatMapPage) once the server
// has created a real Stripe PaymentIntent. `onPaid` is called with the
// confirmed paymentIntentId — the caller still has to call POST
// /bookings/confirm with it, since that's what actually creates the booking
// row server-side (Stripe confirming payment and us confirming the booking
// are two separate steps, on purpose, so the server re-verifies the intent).
export function StripePaymentForm({
  onPaid,
  onError,
  onBack,
  isSubmittingBooking,
}: {
  onPaid: (paymentIntentId: string) => void;
  onError: (message: string) => void;
  onBack: () => void;
  isSubmittingBooking: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsPaying(true);
    try {
      // `redirect: "if_required"` keeps us on this page for the common
      // test-mode case (no 3D Secure) instead of bouncing through
      // `return_url` — the PaymentIntent resolves synchronously and we can
      // just read `paymentIntent.status` below.
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      if (result.error) {
        onError(result.error.message ?? "Payment failed");
        return;
      }
      if (result.paymentIntent?.status === "succeeded") {
        onPaid(result.paymentIntent.id);
      } else {
        onError(`Payment not completed (status: ${result.paymentIntent?.status ?? "unknown"})`);
      }
    } finally {
      setIsPaying(false);
    }
  };

  const busy = isPaying || isSubmittingBooking;

  return (
    <form onSubmit={handleSubmit}>
      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, py: 0.5 }}>
        <AlertTitle sx={{ mb: 0.25, fontSize: "0.8rem" }}>Using test mode?</AlertTitle>
        <Typography variant="caption" color="text.secondary">
          Card <strong>4242 4242 4242 4242</strong>, any future expiry, any CVC/ZIP. Use{" "}
          <strong>4000 0000 0000 0002</strong> to test a decline.
        </Typography>
      </Alert>
      <PaymentElement />
      <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
        <Button onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" variant="contained" size="large" disabled={!stripe || !elements || busy}>
          {busy ? "Processing…" : "Pay now"}
        </Button>
      </Stack>
      {!stripe && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Loading payment form…
        </Typography>
      )}
    </form>
  );
}
