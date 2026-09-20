import { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { useGetOffersQuery } from "../store/api";
import { getErrorMessage } from "../lib/apiError";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
export function OffersPage() {
  useDocumentTitle("Offers & Deals");
  const { data: offers, isLoading, isError, error } = useGetOffersQuery();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(
        () => setCopiedCode((prev) => (prev === code ? null : prev)),
        2000,
      );
    } catch {
      // Clipboard access denied — nothing more we can do.
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Offers & Deals
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Apply any of these codes at checkout to save on your booking.
      </Typography>

      {isLoading && (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      )}
      {isError && (
        <Alert severity="error">
          {getErrorMessage(error as any) ?? "Could not load offers"}
        </Alert>
      )}
      {offers && offers.length === 0 && (
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
          <LocalOfferIcon
            sx={{ fontSize: 48, color: "text.secondary", mb: 1 }}
          />
          <Typography variant="h6" gutterBottom>
            No active offers right now
          </Typography>
          <Typography color="text.secondary">
            Check back soon for new deals.
          </Typography>
        </Box>
      )}

      <Grid container spacing={3}>
        {offers?.map((offer) => (
          <Grid item xs={12} sm={6} md={4} key={offer.code}>
            <Card
              sx={{
                height: "100%",
                position: "relative",
                overflow: "hidden",
                background: (t) =>
                  `linear-gradient(135deg, ${t.palette.primary.dark}33, ${t.palette.secondary.dark}1a)`,
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography
                  variant="h3"
                  fontWeight={800}
                  color="secondary.main"
                  sx={{
                    fontSize: { xs: "2.2rem", sm: "2.6rem" },
                    lineHeight: 1,
                  }}
                >
                  {offer.type === "PERCENT"
                    ? `${offer.value}%`
                    : `₹${offer.value}`}
                </Typography>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                  OFF your booking
                </Typography>

                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mb: 1.5 }}
                >
                  <Chip
                    label={offer.code}
                    sx={{
                      fontWeight: 700,
                      letterSpacing: 1,
                      bgcolor: "background.default",
                    }}
                  />
                  <Tooltip
                    title={copiedCode === offer.code ? "Copied!" : "Copy code"}
                  >
                    <IconButton
                      size="small"
                      onClick={() => handleCopy(offer.code)}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  {offer.expiresAt
                    ? `Valid until ${new Date(offer.expiresAt).toLocaleDateString([], { dateStyle: "medium" })}`
                    : "No expiry"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
