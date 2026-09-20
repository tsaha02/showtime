import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Chip,
} from "@mui/material";
import { useGetGiftCardsQuery } from "../store/adminApi";

export default function GiftCardsPage() {
  const { data: giftCards, isLoading } = useGetGiftCardsQuery();

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Gift Cards</Typography>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Purchased By</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading...</TableCell>
              </TableRow>
            )}
            {!isLoading && giftCards?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>No gift cards yet.</TableCell>
              </TableRow>
            )}
            {giftCards?.map((giftCard) => (
              <TableRow key={giftCard.id}>
                <TableCell>{giftCard.code}</TableCell>
                <TableCell>₹{giftCard.value}</TableCell>
                <TableCell>{giftCard.purchasedByEmail}</TableCell>
                <TableCell>{giftCard.recipientEmail ?? "—"}</TableCell>
                <TableCell>
                  <Chip
                    label={giftCard.redeemed ? "Redeemed" : "Active"}
                    color={giftCard.redeemed ? "default" : "success"}
                    size="small"
                  />
                  {giftCard.redeemed && giftCard.redeemedAt && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      {new Date(giftCard.redeemedAt).toLocaleString()}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{new Date(giftCard.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
