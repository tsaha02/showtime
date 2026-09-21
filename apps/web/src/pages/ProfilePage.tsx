import { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Alert,
  Grid,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import {
  useGetWalletTransactionsQuery,
  useGetMyBookingsQuery,
} from "../store/api";
import { useAppSelector } from "../store/hooks";
import { getErrorMessage } from "../lib/apiError";
import type { WalletTransactionDTO } from "@showtime/shared";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
// Mirrors apps/api/src/services/loyaltyService.ts's tierForBookingCount
// exactly (BRONZE < 5, SILVER 5-14, GOLD 15+) — there's no dedicated
// endpoint for this yet, so it's computed client-side, purely for
// display, from the same confirmed-booking count MyBookingsPage already
// fetches via /bookings/mine.
const LOYALTY_TIERS = [
  {
    tier: "GOLD" as const,
    minBookings: 15,
    cashbackPercent: 3,
    color: "#f5c518",
  },
  {
    tier: "SILVER" as const,
    minBookings: 5,
    cashbackPercent: 1,
    color: "#c0c0c8",
  },
  {
    tier: "BRONZE" as const,
    minBookings: 0,
    cashbackPercent: 0,
    color: "#cd7f32",
  },
];

function tierForBookingCount(confirmedBookingCount: number) {
  return LOYALTY_TIERS.find((t) => confirmedBookingCount >= t.minBookings)!;
}

const REASON_LABELS: Record<WalletTransactionDTO["reason"], string> = {
  CANCELLATION_REFUND: "Cancellation refund",
  REFERRAL_BONUS: "Referral bonus",
  SPENT_AT_CHECKOUT: "Spent at checkout",
  ADMIN_ADJUSTMENT: "Admin adjustment",
};

export function ProfilePage() {
  useDocumentTitle("Profile");
  const user = useAppSelector((s) => s.auth.user);
  const {
    data: transactions,
    isLoading,
    isError,
    error,
  } = useGetWalletTransactionsQuery();
  const { data: bookings } = useGetMyBookingsQuery();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const confirmedBookingCount = (bookings ?? []).filter(
    (b) => b.status === "CONFIRMED",
  ).length;
  const loyalty = tierForBookingCount(confirmedBookingCount);
  // Smallest threshold still above the current count — i.e. the next tier
  // up, not just the first one LOYALTY_TIERS happens to list (that array
  // is ordered GOLD→BRONZE for tierForBookingCount's "first match wins").
  const nextTier = [...LOYALTY_TIERS]
    .sort((a, b) => a.minBookings - b.minBookings)
    .find((t) => t.minBookings > confirmedBookingCount);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(user.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — nothing to do but
      // let the user select/copy the code manually from the chip.
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        My Profile
      </Typography>

      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {user.name}
              </Typography>
              <Typography color="text.secondary">{user.email}</Typography>
            </CardContent>
          </Card>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 1 }}
              >
                <MilitaryTechIcon sx={{ color: loyalty.color }} />
                <Typography variant="h6">Loyalty tier</Typography>
                <Chip
                  label={loyalty.tier}
                  size="small"
                  sx={{
                    bgcolor: loyalty.color,
                    color: "#1a1a1a",
                    fontWeight: 700,
                    ml: "auto",
                  }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {loyalty.cashbackPercent > 0
                  ? `${loyalty.tier[0]}${loyalty.tier.slice(1).toLowerCase()} members earn ${loyalty.cashbackPercent}% cashback to their wallet on every booking.`
                  : "Book 5+ confirmed shows to unlock Silver (1% cashback), or 15+ for Gold (3% cashback)."}
              </Typography>
              {nextTier && (
                <Typography variant="caption" color="text.secondary">
                  {nextTier.minBookings - confirmedBookingCount} more confirmed
                  booking
                  {nextTier.minBookings - confirmedBookingCount > 1
                    ? "s"
                    : ""}{" "}
                  to reach {nextTier.tier}.
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Refer a friend
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Share this code — you and your friend each get ₹100 when they
                complete their first booking.
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  label={user.referralCode}
                  sx={{
                    fontWeight: 700,
                    letterSpacing: 1,
                    fontSize: "1rem",
                    px: 1,
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ContentCopyIcon fontSize="small" />}
                  onClick={handleCopy}
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 0.5 }}
              >
                <AccountBalanceWalletOutlinedIcon color="secondary" />
                <Typography variant="h6">Wallet</Typography>
              </Stack>
              <Typography
                variant="h4"
                color="secondary.main"
                fontWeight={800}
                sx={{ mb: 2 }}
              >
                ₹{user.walletBalance}
              </Typography>

              <Divider sx={{ mb: 2 }} />

              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
              >
                Wallet history
              </Typography>

              {isLoading && (
                <List disablePadding>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <ListItem key={i} divider disableGutters>
                      <ListItemText
                        primary={<Skeleton variant="text" width="50%" />}
                        secondary={<Skeleton variant="text" width="35%" />}
                      />
                      <Skeleton variant="text" width={48} />
                    </ListItem>
                  ))}
                </List>
              )}
              {isError && (
                <Alert severity="error">
                  {getErrorMessage(error as any) ??
                    "Could not load wallet history"}
                </Alert>
              )}
              {transactions && transactions.length === 0 && (
                <Typography color="text.secondary">
                  No wallet transactions yet.
                </Typography>
              )}
              {transactions && transactions.length > 0 && (
                <List disablePadding>
                  {transactions.map((tx) => (
                    <ListItem key={tx.id} divider disableGutters>
                      <ListItemText
                        primary={REASON_LABELS[tx.reason]}
                        secondary={new Date(tx.createdAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      />
                      <Typography
                        variant="subtitle2"
                        color={tx.amount >= 0 ? "success.main" : "error.main"}
                        fontWeight={700}
                      >
                        {tx.amount >= 0 ? "+" : ""}₹{tx.amount}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
