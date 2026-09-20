import { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  TextField,
  Button,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  Link as MuiLink,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import RedeemIcon from "@mui/icons-material/Redeem";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import {
  useCreateGiftCardPaymentIntentMutation,
  usePurchaseGiftCardMutation,
  useRedeemGiftCardMutation,
} from "../store/api";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";
import { StripePaymentForm } from "../components/StripePaymentForm";
import type { CreateGenericPaymentIntentResponseDTO } from "@showtime/shared";

const PRESET_AMOUNTS = [250, 500, 1000];

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export function GiftCardsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();

  // --- Send a gift card ---
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [purchasedByEmail, setPurchasedByEmail] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"form" | "payment" | "success">("form");
  const [paymentIntentInfo, setPaymentIntentInfo] = useState<CreateGenericPaymentIntentResponseDTO | null>(null);
  const [purchasedCode, setPurchasedCode] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  const [createIntent] = useCreateGiftCardPaymentIntentMutation();
  const [purchaseGiftCard, { isLoading: isPurchasing }] = usePurchaseGiftCardMutation();

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const amountValid = Number.isInteger(effectiveAmount) && effectiveAmount >= 100 && effectiveAmount <= 10000;
  const emailValid = /^\S+@\S+\.\S+$/.test(recipientEmail);
  const purchaserEmailValid = user || /^\S+@\S+\.\S+$/.test(purchasedByEmail);

  const finalizePurchase = async (paymentIntentId?: string) => {
    try {
      const result = await purchaseGiftCard({
        value: effectiveAmount,
        recipientEmail,
        purchasedByEmail: user ? undefined : purchasedByEmail,
        message: message || undefined,
        paymentIntentId,
      }).unwrap();
      setPurchasedCode(result.code);
      setStep("success");
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    }
  };

  const handleProceedToPayment = async () => {
    if (!amountValid || !emailValid || !purchaserEmailValid) {
      dispatch(showToast({ message: "Fill in a valid amount and recipient email", severity: "warning" }));
      return;
    }
    setIsPreparing(true);
    try {
      const intent = await createIntent({ value: effectiveAmount }).unwrap();
      setPaymentIntentInfo(intent);
      setStep("payment");
      if (!intent.stripeConfigured) {
        // Mocked-payment fallback (Stripe not configured on this server):
        // behaves like the booking checkout's mocked path — purchase
        // completes immediately, no card details needed.
        await finalizePurchase();
      }
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    } finally {
      setIsPreparing(false);
    }
  };

  const resetForm = () => {
    setStep("form");
    setPaymentIntentInfo(null);
    setPurchasedCode(null);
    setRecipientEmail("");
    setPurchasedByEmail("");
    setMessage("");
    setCustomAmount("");
    setAmount(500);
  };

  // --- Redeem a gift card ---
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemGiftCard, { isLoading: isRedeeming }] = useRedeemGiftCardMutation();
  const [redeemedValue, setRedeemedValue] = useState<number | null>(null);

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    try {
      const { value } = await redeemGiftCard({ code: redeemCode.trim().toUpperCase() }).unwrap();
      setRedeemedValue(value);
      setRedeemCode("");
      dispatch(showToast({ message: `₹${value} added to your wallet!`, severity: "success" }));
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Gift Cards
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Send a ShowTime gift card to a friend, or redeem one you've received into your wallet.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <CardGiftcardIcon color="secondary" />
                <Typography variant="h6">Send a gift card</Typography>
              </Stack>

              {step === "form" && (
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Amount
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                      {PRESET_AMOUNTS.map((preset) => (
                        <Chip
                          key={preset}
                          label={`₹${preset}`}
                          clickable
                          color={!customAmount && amount === preset ? "secondary" : "default"}
                          variant={!customAmount && amount === preset ? "filled" : "outlined"}
                          onClick={() => {
                            setAmount(preset);
                            setCustomAmount("");
                          }}
                        />
                      ))}
                    </Stack>
                    <TextField
                      label="Custom amount (₹100 - ₹10,000)"
                      type="number"
                      size="small"
                      fullWidth
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="e.g. 750"
                    />
                  </Box>

                  <TextField
                    label="Recipient email"
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                  {!user && (
                    <TextField
                      label="Your email (so we can send you a receipt)"
                      type="email"
                      required
                      value={purchasedByEmail}
                      onChange={(e) => setPurchasedByEmail(e.target.value)}
                    />
                  )}
                  <TextField
                    label="Message (optional)"
                    multiline
                    minRows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />

                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleProceedToPayment}
                    disabled={isPreparing || !amountValid || !emailValid || !purchaserEmailValid}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    {isPreparing ? "Preparing…" : `Continue — ₹${amountValid ? effectiveAmount : 0}`}
                  </Button>
                </Stack>
              )}

              {step === "payment" && (
                <Box>
                  {(!paymentIntentInfo || (paymentIntentInfo.stripeConfigured === false && isPurchasing)) && (
                    <Box display="flex" justifyContent="center" py={4}>
                      <CircularProgress size={28} />
                    </Box>
                  )}

                  {paymentIntentInfo && paymentIntentInfo.stripeConfigured === false && !isPurchasing && (
                    <Alert severity="info">Payments aren't configured on this server — finalizing as a demo purchase…</Alert>
                  )}

                  {paymentIntentInfo && paymentIntentInfo.stripeConfigured && (
                    stripePromise ? (
                      <Elements stripe={stripePromise} options={{ clientSecret: paymentIntentInfo.clientSecret }}>
                        <StripePaymentForm
                          onPaid={(paymentIntentId) => finalizePurchase(paymentIntentId)}
                          onError={(msg) => dispatch(showToast({ message: msg, severity: "error" }))}
                          onBack={() => {
                            setStep("form");
                            setPaymentIntentInfo(null);
                          }}
                          isSubmittingBooking={isPurchasing}
                        />
                      </Elements>
                    ) : (
                      <Alert severity="error">
                        Stripe is configured server-side but VITE_STRIPE_PUBLISHABLE_KEY is missing here.
                      </Alert>
                    )
                  )}
                </Box>
              )}

              {step === "success" && purchasedCode && (
                <Stack spacing={2} alignItems="flex-start">
                  <Alert severity="success" sx={{ width: "100%" }}>
                    Gift card sent to {recipientEmail}!
                  </Alert>
                  <Typography variant="body2" color="text.secondary">
                    Code (also emailed to the recipient):
                  </Typography>
                  <Chip
                    label={purchasedCode}
                    sx={{ fontWeight: 700, letterSpacing: 1, fontSize: "1rem", px: 1 }}
                    color="secondary"
                  />
                  <Button variant="outlined" onClick={resetForm}>
                    Send another
                  </Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <RedeemIcon color="secondary" />
                <Typography variant="h6">Redeem a gift card</Typography>
              </Stack>

              {!user ? (
                <Typography color="text.secondary">
                  <MuiLink component={RouterLink} to="/login">
                    Log in
                  </MuiLink>{" "}
                  to redeem a gift card straight into your wallet.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Have a code? Redeem it and the value is credited to your wallet immediately.
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      label="Gift card code"
                      size="small"
                      fullWidth
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                    />
                    <Button
                      variant="contained"
                      onClick={handleRedeem}
                      disabled={isRedeeming || !redeemCode.trim()}
                    >
                      Redeem
                    </Button>
                  </Stack>
                  {redeemedValue !== null && (
                    <>
                      <Divider />
                      <Alert severity="success">
                        ₹{redeemedValue} added to your wallet. New balance: ₹{user.walletBalance}
                      </Alert>
                    </>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
