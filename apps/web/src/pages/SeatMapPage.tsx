import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  CircularProgress,
  Skeleton,
  Alert,
  Card,
  CardContent,
  Button,
  Stack,
  TextField,
  Checkbox,
  FormControlLabel,
  Chip,
  Divider,
  Paper,
  Grid,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LocalActivityOutlinedIcon from "@mui/icons-material/LocalActivityOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FastfoodOutlinedIcon from "@mui/icons-material/FastfoodOutlined";
import LocalPizzaOutlinedIcon from "@mui/icons-material/LocalPizzaOutlined";
import LocalBarOutlinedIcon from "@mui/icons-material/LocalBarOutlined";
import RamenDiningOutlinedIcon from "@mui/icons-material/RamenDiningOutlined";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import VolunteerActivismOutlinedIcon from "@mui/icons-material/VolunteerActivismOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import {
  useGetSeatMapQuery,
  useConfirmBookingMutation,
  useCreatePaymentIntentMutation,
  usePreviewCouponMutation,
  useGetFoodItemsQuery,
  useGetDonationsTotalQuery,
} from "../store/api";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  setSeatMap,
  clearBookingFlow,
  selectHeldSeats,
  selectCartTotal,
} from "../store/slices/bookingSlice";
import { showToast } from "../store/slices/uiSlice";
import { useShowRoom } from "../hooks/useShowRoom";
import { useHoldCountdown } from "../hooks/useHoldCountdown";
import { getErrorMessage } from "../lib/apiError";
import { SeatMapGrid } from "../components/SeatMapGrid";
import { TicketQRCode } from "../components/TicketQRCode";
import { StripePaymentForm } from "../components/StripePaymentForm";
import { downloadTicketPdf } from "../lib/downloadTicketPdf";
import type { BookingDTO, CouponPreviewDTO, CreatePaymentIntentResponseDTO, SeatCategory } from "@showtime/shared";

const STEPS = ["Select Seats", "Details", "Confirm & Pay", "Success"];

// Created once at module scope (not per render) per Stripe's docs. When the
// publishable key isn't set yet (Stripe not configured on this machine),
// this is just null and the component below falls back to the old mocked
// flow instead of trying to mount Elements.
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export function SeatMapPage() {
  const { showId = "" } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { data, isLoading, isError, error, refetch } = useGetSeatMapQuery(showId, { skip: !showId });
  const seatMap = useAppSelector((s) => s.booking.seatMap);
  const heldSeats = useAppSelector(selectHeldSeats);
  const cartTotal = useAppSelector(selectCartTotal);
  const secondsLeft = useHoldCountdown();

  const [activeStep, setActiveStep] = useState(0);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingDTO | null>(null);
  const [paymentIntentInfo, setPaymentIntentInfo] = useState<CreatePaymentIntentResponseDTO | null>(null);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreviewDTO & { code: string } | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  // Food & Beverages — quantity per foodItemId, 0 entries omitted from the
  // payload sent to the API (only items the guest actually wants).
  const { data: foodItems } = useGetFoodItemsQuery();
  const [foodQuantities, setFoodQuantities] = useState<Record<string, number>>({});
  const [useWallet, setUseWallet] = useState(false);
  const [roundUpDonation, setRoundUpDonation] = useState(false);
  const { data: donationsTotal } = useGetDonationsTotalQuery();
  const [splitCount, setSplitCount] = useState(1);

  const foodItemsPayload = useMemo(
    () =>
      Object.entries(foodQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([foodItemId, quantity]) => ({ foodItemId, quantity })),
    [foodQuantities],
  );
  const foodTotal = useMemo(
    () => (foodItems ?? []).reduce((sum, item) => sum + (foodQuantities[item.id] ?? 0) * item.price, 0),
    [foodItems, foodQuantities],
  );
  const foodItemsByCategory = useMemo(() => {
    const groups: Record<string, NonNullable<typeof foodItems>> = {};
    for (const item of foodItems ?? []) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [foodItems]);

  const updateFoodQty = (id: string, delta: number) => {
    setFoodQuantities((prev) => {
      const next = Math.min(20, Math.max(0, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const [confirmBooking, { isLoading: isConfirming }] = useConfirmBookingMutation();
  const [createPaymentIntent] = useCreatePaymentIntentMutation();
  const [previewCoupon, { isLoading: isApplyingCoupon }] = usePreviewCouponMutation();

  // Live socket updates for this show while the page is open.
  useShowRoom(showId || null);

  // Load the initial REST snapshot into bookingSlice once.
  useEffect(() => {
    if (data) {
      dispatch(setSeatMap({ showId, seats: data.seats, prices: data.show.prices }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Clear the booking flow when leaving this page entirely.
  useEffect(() => {
    return () => {
      dispatch(clearBookingFlow());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If our countdown hits zero, the holds have expired server-side (Redis
  // TTL) too — clear local state and bounce back to seat selection with a
  // clear message instead of letting the user try to pay for seats that
  // are no longer actually held.
  useEffect(() => {
    if (secondsLeft === 0 && heldSeats.length > 0 && activeStep < 3) {
      dispatch(showToast({ message: "Your seat holds expired. Please select seats again.", severity: "warning" }));
      refetch();
      setPaymentIntentInfo(null);
      setActiveStep(0);
    }
  }, [secondsLeft, heldSeats.length, activeStep, dispatch, refetch]);

  // Right on entering the Confirm & Pay step, ask the server whether Stripe
  // is configured and, if so, create a real PaymentIntent for these seats.
  // Only fetched once per visit to this step (guarded by paymentIntentInfo
  // being null) — going Back and Continue again re-fetches, since the held
  // seats (and so the price) may have changed.
  useEffect(() => {
    if (activeStep !== 2 || paymentIntentInfo || isPreparingPayment || heldSeats.length === 0) return;
    setIsPreparingPayment(true);
    createPaymentIntent({
      showId,
      seatIds: heldSeats.map((s) => s.id),
      couponCode: appliedCoupon?.code,
      foodItems: foodItemsPayload.length ? foodItemsPayload : undefined,
      useWallet: user && useWallet ? true : undefined,
      roundUpDonation: roundUpDonation || undefined,
    })
      .unwrap()
      .then(setPaymentIntentInfo)
      .catch((err) => {
        dispatch(showToast({ message: getErrorMessage(err), severity: "error" }));
        setActiveStep(user ? 0 : 1);
        refetch();
      })
      .finally(() => setIsPreparingPayment(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, paymentIntentInfo, isPreparingPayment]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const result = await previewCoupon({
        code: couponCode.trim(),
        showId,
        seatIds: heldSeats.map((s) => s.id),
      }).unwrap();
      if (result.valid) {
        setAppliedCoupon({ ...result, code: couponCode.trim() });
        setCouponMessage({ text: `✓ Coupon applied — ₹${result.discountAmount} off`, ok: true });
      } else {
        setAppliedCoupon(null);
        setCouponMessage({ text: result.message || "Invalid code", ok: false });
      }
    } catch (err) {
      setAppliedCoupon(null);
      setCouponMessage({ text: getErrorMessage(err as any), ok: false });
    }
  };

  const goToDetails = () => {
    if (heldSeats.length === 0) {
      dispatch(showToast({ message: "Select at least one seat to continue", severity: "warning" }));
      return;
    }
    // Logged-in users skip the guest-details step entirely.
    setActiveStep(user ? 2 : 1);
  };

  const goToConfirmFromDetails = () => {
    if (guestName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(guestEmail)) {
      dispatch(showToast({ message: "Enter a valid name and email to continue", severity: "warning" }));
      return;
    }
    setActiveStep(2);
  };

  // POST /bookings/confirm responds synchronously with the full BookingDTO
  // (this API's "payment" is simulated in-request, not an async webhook),
  // so that response is already the authoritative confirmation — we don't
  // need to additionally wait on the `booking:confirmed` socket event here.
  // The server still emits it (and `seat:booked`) so that OTHER clients
  // currently viewing this same show's seat map — handled by useShowRoom's
  // SEAT_BOOKED listener — see those seats flip to BOOKED in real time.
  // Shared tail end of both payment paths: hit /bookings/confirm with
  // whichever of simulatePaymentFailure/paymentIntentId applies, then move
  // to the Success step.
  const finalizeBooking = async (opts: { simulatePaymentFailure?: boolean; paymentIntentId?: string }) => {
    try {
      const booking = await confirmBooking({
        showId,
        seatIds: heldSeats.map((s) => s.id),
        guestDetails: user ? undefined : { guestName, guestEmail, guestPhone: guestPhone || undefined },
        couponCode: appliedCoupon?.code,
        foodItems: foodItemsPayload.length ? foodItemsPayload : undefined,
        useWallet: user && useWallet ? true : undefined,
        roundUpDonation: roundUpDonation || undefined,
        ...opts,
      }).unwrap();
      setConfirmedBooking(booking);
      dispatch(clearBookingFlow());
      setActiveStep(3);
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
      // On a 409 (hold expired / seat taken), refresh the seat map so the
      // grid reflects reality before the user tries again.
      refetch();
    }
  };

  // Fallback path (Stripe not configured server-side): behaves exactly like
  // the old mocked-payment flow.
  const handleConfirm = () => finalizeBooking({ simulatePaymentFailure: simulateFailure || undefined });

  // Stripe-configured path: called by StripePaymentForm once
  // stripe.confirmPayment() has already succeeded on the client.
  const handleStripePaid = (paymentIntentId: string) => finalizeBooking({ paymentIntentId });

  const goBackFromConfirm = () => {
    setPaymentIntentInfo(null);
    setAppliedCoupon(null);
    setCouponMessage(null);
    setCouponCode("");
    setActiveStep(user ? 0 : 1);
  };

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={260} height={32} />
        <Skeleton variant="text" width={340} sx={{ mb: 3 }} />

        {/* Stepper area */}
        <Stack direction="row" spacing={2} sx={{ my: 4, px: 2 }} justifyContent="space-between">
          {STEPS.map((label) => (
            <Stack key={label} alignItems="center" spacing={1} sx={{ flex: 1 }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Skeleton variant="text" width="60%" />
            </Stack>
          ))}
        </Stack>

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            {/* Seat grid placeholder */}
            <Skeleton variant="rounded" height={360} sx={{ borderRadius: 2 }} />
          </Grid>
          <Grid item xs={12} md={4}>
            {/* Side summary panel */}
            <Card>
              <CardContent>
                <Skeleton variant="text" width="50%" sx={{ mb: 1.5 }} />
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                  <Skeleton variant="rounded" width={48} height={28} />
                  <Skeleton variant="rounded" width={48} height={28} />
                  <Skeleton variant="rounded" width={48} height={28} />
                </Stack>
                <Skeleton variant="text" width="70%" height={32} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  }
  if (isError || !data) {
    return <Alert severity="error">{getErrorMessage(error as any) ?? "Could not load seat map"}</Alert>;
  }

  const prices = data.show.prices;

  // Pre-wallet total shown in the order summary / used to estimate wallet
  // coverage for display only — the server always recomputes and enforces
  // the authoritative amount.
  const orderSubtotalBeforeWallet =
    (appliedCoupon ? appliedCoupon.finalAmount : cartTotal) + foodTotal;

  // Mirrors apps/api/src/services/donationService.ts's computeDonationAmount
  // exactly — display-only preview; the server recomputes and charges the
  // authoritative amount off the same base (seats − discount + food).
  const donationPreview = roundUpDonation && orderSubtotalBeforeWallet > 0
    ? (10 - (orderSubtotalBeforeWallet % 10)) % 10
    : 0;

  // What was actually charged for the confirmed booking (Success screen +
  // split-the-bill calculator) — seats + food − discount + donation −
  // wallet, mirroring the same formula the price breakdown above uses.
  const totalCharged = confirmedBooking
    ? confirmedBooking.totalAmount -
      confirmedBooking.discountAmount +
      confirmedBooking.foodTotal +
      confirmedBooking.donationAmount -
      confirmedBooking.walletAmountUsed
    : 0;

  // Per-category subtotal for the order summary breakdown (falls back to a
  // flat seat-count line when everything's in one category).
  const seatsByCategory = heldSeats.reduce<Partial<Record<SeatCategory, number>>>((acc, seat) => {
    acc[seat.category] = (acc[seat.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {data.show.movieTitle}
      </Typography>
      <Typography color="text.secondary" gutterBottom>
        {data.show.theatreName} · {data.show.screenName} ·{" "}
        {new Date(data.show.startTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
      </Typography>

      <Stepper activeStep={activeStep} alternativeLabel={isMobile} sx={{ my: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{isMobile ? label.split(" ")[0] : label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {secondsLeft !== null && secondsLeft > 0 && activeStep < 3 && (
        <Alert severity={secondsLeft <= 30 ? "warning" : "info"} sx={{ mb: 2 }}>
          Seat hold expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </Alert>
      )}

      {activeStep === 0 && (
        <Box sx={{ pb: 10 }}>
          <SeatMapGrid showId={showId} seats={seatMap} prices={prices} />

          {heldSeats.length > 0 && foodItems && foodItems.length > 0 && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2.5 }}>
                  <FastfoodOutlinedIcon color="secondary" />
                  <Typography variant="h6">Food & Beverages</Typography>
                </Stack>
                <Stack spacing={3}>
                  {(["SNACK", "DRINK", "COMBO"] as const)
                    .filter((category) => foodItemsByCategory[category]?.length)
                    .map((category) => {
                      const CategoryIcon =
                        category === "SNACK"
                          ? LocalPizzaOutlinedIcon
                          : category === "DRINK"
                            ? LocalBarOutlinedIcon
                            : RamenDiningOutlinedIcon;
                      return (
                        <Box key={category}>
                          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
                            <CategoryIcon fontSize="small" color="secondary" />
                            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
                              {category === "SNACK" ? "Snacks" : category === "DRINK" ? "Drinks" : "Combos"}
                            </Typography>
                          </Stack>
                          <Grid container spacing={1.5}>
                            {foodItemsByCategory[category].map((item) => {
                              const qty = foodQuantities[item.id] ?? 0;
                              return (
                                <Grid item xs={12} sm={6} md={4} key={item.id}>
                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      p: 1.5,
                                      height: "100%",
                                      display: "flex",
                                      flexDirection: "column",
                                      borderColor: qty > 0 ? "secondary.main" : "divider",
                                      bgcolor: qty > 0 ? "action.hover" : "transparent",
                                      transition: "border-color 150ms ease, background-color 150ms ease",
                                    }}
                                  >
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                      <Typography variant="body1" fontWeight={600}>
                                        {item.name}
                                      </Typography>
                                      <Chip label={`₹${item.price}`} size="small" color="secondary" variant="outlined" />
                                    </Stack>
                                    {item.description && (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{
                                          mt: 0.5,
                                          flexGrow: 1,
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                          overflow: "hidden",
                                        }}
                                      >
                                        {item.description}
                                      </Typography>
                                    )}
                                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1} sx={{ mt: 1.5 }}>
                                      <IconButton
                                        size="small"
                                        onClick={() => updateFoodQty(item.id, -1)}
                                        disabled={qty === 0}
                                        aria-label={`Decrease ${item.name} quantity`}
                                        sx={{ border: "1px solid", borderColor: "divider" }}
                                      >
                                        <RemoveIcon fontSize="small" />
                                      </IconButton>
                                      <Typography sx={{ width: 24, textAlign: "center" }} fontWeight={600}>
                                        {qty}
                                      </Typography>
                                      <IconButton
                                        size="small"
                                        onClick={() => updateFoodQty(item.id, 1)}
                                        disabled={qty >= 20}
                                        aria-label={`Increase ${item.name} quantity`}
                                        sx={{ border: "1px solid", borderColor: "divider" }}
                                      >
                                        <AddIcon fontSize="small" />
                                      </IconButton>
                                    </Stack>
                                  </Paper>
                                </Grid>
                              );
                            })}
                          </Grid>
                        </Box>
                      );
                    })}
                </Stack>
                {foodTotal > 0 && (
                  <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
                    <Typography variant="subtitle2" color="secondary.main">
                      Food total: ₹{foodTotal}
                    </Typography>
                  </Stack>
                )}
              </CardContent>
            </Card>
          )}

          {/* Sticky group-booking cart summary: makes it obvious mid-selection
              that multiple seats are being accumulated into one booking,
              not just a single seat pick. */}
          <Paper
            elevation={6}
            sx={{
              position: "sticky",
              bottom: 0,
              left: 0,
              right: 0,
              mt: 3,
              p: 2,
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 2,
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
              zIndex: 2,
            }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {heldSeats.length === 0
                  ? "No seats selected yet"
                  : `${heldSeats.length} seat${heldSeats.length > 1 ? "s" : ""} selected`}
              </Typography>
              {heldSeats.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                  {heldSeats.map((seat) => (
                    <Chip key={seat.id} label={seat.label} size="small" />
                  ))}
                </Stack>
              )}
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="h6">Total: ₹{cartTotal + foodTotal}</Typography>
              <Button variant="contained" size="large" onClick={goToDetails} disabled={heldSeats.length === 0}>
                Continue
              </Button>
            </Stack>
          </Paper>
        </Box>
      )}

      {activeStep === 1 && (
        // Two columns, same pattern as the Confirm & Pay step below — a
        // single narrow, left-floating Card here left a large empty void
        // on wide screens (the specific "doesn't look good" complaint
        // this replaced), so the seat/show summary now fills that space
        // meaningfully instead of sitting blank.
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card sx={{ position: { md: "sticky" }, top: { md: 88 } }}>
              <Box
                sx={{
                  px: 3,
                  py: 2.5,
                  background: (t) =>
                    `linear-gradient(135deg, ${t.palette.primary.dark}33, ${t.palette.secondary.dark}1a)`,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                }}
              >
                <LocalActivityOutlinedIcon color="secondary" sx={{ mt: 0.25 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} lineHeight={1.3}>
                    {data.show.movieTitle}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {data.show.theatreName} · {data.show.screenName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(data.show.startTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </Typography>
                </Box>
              </Box>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Seats
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2, mt: 0.5 }}>
                  {heldSeats.map((seat) => (
                    <Chip key={seat.id} label={seat.label} size="small" color="secondary" variant="outlined" />
                  ))}
                </Stack>
                <Divider sx={{ mb: 2 }} />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle1">Subtotal</Typography>
                  <Typography variant="subtitle1">₹{cartTotal + foodTotal}</Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Your details
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Full name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    required
                  />
                  <TextField
                    label="Email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    required
                  />
                  <TextField
                    label="Phone (optional)"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                  />
                  <Stack direction="row" spacing={2}>
                    <Button onClick={() => setActiveStep(0)}>Back</Button>
                    <Button variant="contained" onClick={goToConfirmFromDetails}>
                      Continue
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeStep === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card sx={{ position: { md: "sticky" }, top: { md: 88 } }}>
              <Box
                sx={{
                  px: 3,
                  py: 2.5,
                  background: (t) =>
                    `linear-gradient(135deg, ${t.palette.primary.dark}33, ${t.palette.secondary.dark}1a)`,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                }}
              >
                <LocalActivityOutlinedIcon color="secondary" sx={{ mt: 0.25 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} lineHeight={1.3}>
                    {data.show.movieTitle}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {data.show.theatreName} · {data.show.screenName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(data.show.startTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </Typography>
                </Box>
              </Box>
              <CardContent>
                <Typography variant="overline" color="text.secondary">
                  Seats
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2, mt: 0.5 }}>
                  {heldSeats.map((seat) => (
                    <Chip key={seat.id} label={seat.label} size="small" color="secondary" variant="outlined" />
                  ))}
                </Stack>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="overline" color="text.secondary">
                  Price breakdown
                </Typography>
                <Stack spacing={1} sx={{ mt: 0.5, mb: 2 }}>
                  {(Object.entries(seatsByCategory) as [SeatCategory, number][]).map(([category, count]) => (
                    <Stack key={category} direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        {category} × {count} seat{count > 1 ? "s" : ""} (₹{prices[category] ?? 0} each)
                      </Typography>
                      <Typography variant="body2">₹{(prices[category] ?? 0) * count}</Typography>
                    </Stack>
                  ))}
                </Stack>

                <Divider sx={{ mb: 2 }} />

                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                  <TextField
                    label="Coupon code"
                    size="small"
                    placeholder="Try WELCOME10"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    disabled={!!appliedCoupon}
                    fullWidth
                  />
                  {appliedCoupon ? (
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponMessage(null);
                        setCouponCode("");
                        setPaymentIntentInfo(null);
                      }}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      onClick={async () => {
                        await handleApplyCoupon();
                        setPaymentIntentInfo(null);
                      }}
                      disabled={isApplyingCoupon || !couponCode.trim()}
                    >
                      Apply
                    </Button>
                  )}
                </Stack>
                {couponMessage && (
                  <Typography
                    variant="body2"
                    color={couponMessage.ok ? "success.main" : "error.main"}
                    sx={{ mb: 1.5 }}
                  >
                    {couponMessage.text}
                  </Typography>
                )}

                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Subtotal
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ₹{cartTotal}
                  </Typography>
                </Stack>
                {foodTotal > 0 && (
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Food total
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ₹{foodTotal}
                    </Typography>
                  </Stack>
                )}
                {appliedCoupon && (
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" color="success.main">
                      Discount ({appliedCoupon.code})
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      -₹{appliedCoupon.discountAmount}
                    </Typography>
                  </Stack>
                )}

                {user && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={useWallet}
                            onChange={(e) => {
                              setUseWallet(e.target.checked);
                              setPaymentIntentInfo(null);
                            }}
                          />
                        }
                        label={
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <AccountBalanceWalletOutlinedIcon fontSize="small" color="action" />
                            <Typography variant="body2">Use wallet balance</Typography>
                          </Stack>
                        }
                      />
                      <Typography variant="caption" color="text.secondary">
                        ₹{user.walletBalance} available
                      </Typography>
                    </Stack>
                    {useWallet && (
                      <Typography variant="body2" color="success.main" sx={{ mb: 1 }}>
                        ~₹{Math.min(user.walletBalance, Math.max(0, orderSubtotalBeforeWallet))} will be applied from
                        your wallet
                      </Typography>
                    )}
                  </>
                )}

                <Divider sx={{ my: 1.5 }} />
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap">
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={roundUpDonation}
                        onChange={(e) => {
                          setRoundUpDonation(e.target.checked);
                          setPaymentIntentInfo(null);
                        }}
                      />
                    }
                    label={
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <VolunteerActivismOutlinedIcon fontSize="small" color="action" />
                        <Typography variant="body2">
                          Round up{donationPreview > 0 ? ` to ₹${orderSubtotalBeforeWallet + donationPreview}` : ""}{" "}
                          and donate the difference
                        </Typography>
                      </Stack>
                    }
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Demo feature — no real charity receives this, but it's charged the same as everything else
                  (Stripe test mode).
                </Typography>
                {donationsTotal !== undefined && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    Join others — ₹{donationsTotal} raised so far (demo total)
                  </Typography>
                )}
                {donationPreview > 0 && (
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Donation round-up
                    </Typography>
                    <Typography variant="body2">₹{donationPreview}</Typography>
                  </Stack>
                )}

                <Divider sx={{ mb: 2, mt: user ? 0 : 2 }} />

                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="subtitle1" fontWeight={700}>
                    Total
                  </Typography>
                  <Typography variant="h5" color="secondary.main" fontWeight={800}>
                    ₹{orderSubtotalBeforeWallet + donationPreview}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
                  <Typography variant="h6">Payment</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <LockOutlinedIcon fontSize="small" color="action" />
                    <Typography variant="caption" color="text.secondary">
                      Secured by Stripe
                    </Typography>
                  </Stack>
                </Stack>

                {(isPreparingPayment || !paymentIntentInfo) && (
                  <Box display="flex" justifyContent="center" py={4}>
                    <CircularProgress size={28} />
                  </Box>
                )}

                {paymentIntentInfo && !paymentIntentInfo.stripeConfigured && (
                  <>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Payments aren't configured on this server yet — this is a mocked checkout for demo purposes.
                    </Alert>
                    <FormControlLabel
                      control={
                        <Checkbox checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />
                      }
                      label="Simulate payment failure (demo)"
                    />
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                      <Button onClick={goBackFromConfirm}>Back</Button>
                      <Button variant="contained" size="large" onClick={handleConfirm} disabled={isConfirming}>
                        {isConfirming ? "Processing…" : "Confirm & Pay"}
                      </Button>
                    </Stack>
                  </>
                )}

                {paymentIntentInfo && paymentIntentInfo.stripeConfigured && (
                  stripePromise ? (
                    <Elements stripe={stripePromise} options={{ clientSecret: paymentIntentInfo.clientSecret }}>
                      <StripePaymentForm
                        onPaid={handleStripePaid}
                        onError={(message) => dispatch(showToast({ message, severity: "error" }))}
                        onBack={goBackFromConfirm}
                        isSubmittingBooking={isConfirming}
                      />
                    </Elements>
                  ) : (
                    <Alert severity="error">
                      Stripe is configured on the server but VITE_STRIPE_PUBLISHABLE_KEY is missing from this app's
                      environment. Set it and reload to continue.
                    </Alert>
                  )
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeStep === 3 && confirmedBooking && (
        <Box display="flex" justifyContent="center">
          <Box sx={{ width: "100%", maxWidth: 840 }}>
            <Stack alignItems="center" spacing={1} sx={{ mb: 3, textAlign: "center" }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: "success.main" }} />
              <Typography variant="h5" fontWeight={700}>
                Booking confirmed!
              </Typography>
              <Typography color="text.secondary">
                A confirmation has been sent to your email — you're all set for {confirmedBooking.movieTitle}.
              </Typography>
            </Stack>

            <Grid container spacing={3} alignItems="stretch" justifyContent="center">
              <Grid item xs={12} sm={7}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Reference: <strong>{confirmedBooking.reference}</strong>
                    </Typography>
                    <Stack spacing={1} sx={{ my: 2 }}>
                      {confirmedBooking.seats.map((seat) => (
                        <Stack key={seat.seatId} direction="row" justifyContent="space-between">
                          <Chip label={`${seat.label} (${seat.category})`} size="small" />
                          <Typography>₹{seat.price}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    {confirmedBooking.foodItems.length > 0 && (
                      <>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="overline" color="text.secondary">
                          Food & Beverages
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {confirmedBooking.foodItems.map((item, idx) => (
                            <Stack key={idx} direction="row" justifyContent="space-between">
                              <Typography variant="body2" color="text.secondary">
                                {item.name} × {item.quantity}
                              </Typography>
                              <Typography variant="body2">₹{item.price * item.quantity}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </>
                    )}
                    <Divider sx={{ my: 2 }} />
                    {confirmedBooking.discountAmount > 0 && (
                      <>
                        <Stack direction="row" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">
                            Subtotal
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            ₹{confirmedBooking.totalAmount}
                          </Typography>
                        </Stack>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                          <Typography variant="body2" color="success.main">
                            Coupon {confirmedBooking.couponCode} savings
                          </Typography>
                          <Typography variant="body2" color="success.main">
                            -₹{confirmedBooking.discountAmount}
                          </Typography>
                        </Stack>
                      </>
                    )}
                    {confirmedBooking.walletAmountUsed > 0 && (
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" color="success.main">
                          Paid from wallet
                        </Typography>
                        <Typography variant="body2" color="success.main">
                          -₹{confirmedBooking.walletAmountUsed}
                        </Typography>
                      </Stack>
                    )}
                    {confirmedBooking.donationAmount > 0 && (
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          Charity round-up (demo)
                        </Typography>
                        <Typography variant="body2">₹{confirmedBooking.donationAmount}</Typography>
                      </Stack>
                    )}
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 3 }}>
                      <Typography variant="h6">Total paid</Typography>
                      <Typography variant="h6" color="secondary.main" fontWeight={700}>
                        ₹{totalCharged}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      <Button variant="contained" onClick={() => navigate("/")}>
                        Back to Home
                      </Button>
                      <Button variant="outlined" onClick={() => window.print()}>
                        Print ticket
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => downloadTicketPdf(ticketRef, `ticket-${confirmedBooking.reference}.pdf`)}
                      >
                        Download PDF
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={5} sx={{ display: "flex" }}>
                <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
                  <TicketQRCode ref={ticketRef} booking={confirmedBooking} />
                </Box>
              </Grid>
            </Grid>

            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Split the bill
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  A quick calculator for splitting this booking with friends — nothing is charged or collected here,
                  just the math and a shareable summary.
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                  <TextField
                    label="How many people?"
                    type="number"
                    size="small"
                    value={splitCount}
                    onChange={(e) =>
                      setSplitCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                    }
                    sx={{ width: 160 }}
                    inputProps={{ min: 1, max: 50 }}
                  />
                  <Typography variant="h6">
                    ₹{Math.ceil(totalCharged / splitCount)} <Typography component="span" variant="body2" color="text.secondary">per person</Typography>
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={async () => {
                      const summary = `I booked ${confirmedBooking.seats.length} seat${confirmedBooking.seats.length > 1 ? "s" : ""} for ${confirmedBooking.movieTitle} — total ₹${totalCharged}, split ${splitCount} way${splitCount > 1 ? "s" : ""} = ₹${Math.ceil(totalCharged / splitCount)} each. Ref: ${confirmedBooking.reference}`;
                      try {
                        await navigator.clipboard.writeText(summary);
                        dispatch(showToast({ message: "Summary copied to clipboard", severity: "success" }));
                      } catch {
                        dispatch(showToast({ message: "Couldn't copy — clipboard access denied", severity: "warning" }));
                      }
                    }}
                  >
                    Copy summary
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
}
