import { useState } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Rating,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useGetRatingsQuery, useDeleteRatingMutation } from "../store/adminApi";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

export default function RatingsPage() {
  const { data: ratings, isLoading } = useGetRatingsQuery();
  const [deleteRating] = useDeleteRatingMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this rating?")) return;
    try {
      await deleteRating(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Ratings
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Movie</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Stars</TableCell>
              <TableCell>Comment</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading...</TableCell>
              </TableRow>
            )}
            {ratings?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.movieTitle}</TableCell>
                <TableCell>{r.userName}</TableCell>
                <TableCell>
                  <Rating value={r.stars} readOnly size="small" />
                </TableCell>
                <TableCell>{r.comment ?? "—"}</TableCell>
                <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleDelete(r.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  );
}
