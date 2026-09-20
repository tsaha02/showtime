import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Chip,
} from "@mui/material";
import { useLazyGetBookingsQuery } from "../store/adminApi";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

export default function BookingsPage() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [showId, setShowId] = useState("");
  const [trigger, { data: bookings, isFetching }] = useLazyGetBookingsQuery();
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    setError(null);
    setSearched(true);
    try {
      await trigger({
        reference: reference || undefined,
        email: email || undefined,
        showId: showId || undefined,
      }).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Bookings
      </Typography>

      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        <TextField size="small" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField size="small" label="Show ID" value={showId} onChange={(e) => setShowId(e.target.value)} />
        <Button variant="contained" onClick={handleSearch}>
          Search
        </Button>
      </Paper>

      {searched && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Movie</TableCell>
                <TableCell>Theatre / Screen</TableCell>
                <TableCell>Show Time</TableCell>
                <TableCell>Seats</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isFetching && (
                <TableRow>
                  <TableCell colSpan={9}>Loading...</TableCell>
                </TableRow>
              )}
              {!isFetching && bookings?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9}>No bookings found.</TableCell>
                </TableRow>
              )}
              {bookings?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.reference}</TableCell>
                  <TableCell>
                    <Chip label={b.status} size="small" />
                  </TableCell>
                  <TableCell>{b.movieTitle}</TableCell>
                  <TableCell>
                    {b.theatreName} / {b.screenName}
                  </TableCell>
                  <TableCell>{new Date(b.showStartTime).toLocaleString()}</TableCell>
                  <TableCell>{b.seats.map((s) => s.label).join(", ")}</TableCell>
                  <TableCell>{b.totalAmount}</TableCell>
                  <TableCell>{b.userEmail ?? b.guestEmail ?? "—"}</TableCell>
                  <TableCell>{new Date(b.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  );
}
