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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Checkbox,
  ListItemText,
  Select,
  InputLabel,
  FormControl,
  OutlinedInput,
  Snackbar,
  Alert,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { SEAT_CATEGORIES, type SeatCategory } from "@showtime/shared";
import {
  useGetShowsQuery,
  useGetMoviesQuery,
  useGetTheatresQuery,
  useCreateShowMutation,
  useDeleteShowMutation,
  useAutoScheduleShowsMutation,
} from "../store/adminApi";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

export default function ShowsPage() {
  const { data: shows, isLoading } = useGetShowsQuery();
  const { data: movies } = useGetMoviesQuery();
  const { data: theatres } = useGetTheatresQuery();
  const [createShow] = useCreateShowMutation();
  const [deleteShow] = useDeleteShowMutation();
  const [autoScheduleShows, autoSchedule] = useAutoScheduleShowsMutation();

  const [autoDialogOpen, setAutoDialogOpen] = useState(false);
  const [autoMovieIds, setAutoMovieIds] = useState<string[]>([]);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoSuccess, setAutoSuccess] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [movieId, setMovieId] = useState("");
  const [screenId, setScreenId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [prices, setPrices] = useState<Record<SeatCategory, string>>({
    SILVER: "",
    GOLD: "",
    PREMIUM: "",
    RECLINER: "",
  });
  const [error, setError] = useState<string | null>(null);

  const allScreens = (theatres ?? []).flatMap((t) =>
    t.screens.map((s) => ({ ...s, theatreName: t.name })),
  );

  function openCreate() {
    setMovieId("");
    setScreenId("");
    setStartTime("");
    setPrices({ SILVER: "", GOLD: "", PREMIUM: "", RECLINER: "" });
    setDialogOpen(true);
  }

  async function handleCreate() {
    try {
      const priceEntries = SEAT_CATEGORIES.filter((c) => prices[c].trim() !== "").map((c) => ({
        category: c,
        price: Number(prices[c]),
      }));
      if (priceEntries.length === 0) {
        setError("Enter at least one price.");
        return;
      }
      await createShow({
        movieId,
        screenId,
        startTime: new Date(startTime).toISOString(),
        prices: priceEntries,
      }).unwrap();
      setDialogOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this show?")) return;
    try {
      await deleteShow(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function openAutoSchedule() {
    setAutoMovieIds([]);
    setAutoDialogOpen(true);
  }

  async function handleAutoSchedule() {
    try {
      const result = await autoScheduleShows({ movieIds: autoMovieIds }).unwrap();
      setAutoSuccess(
        `Scheduled ${result.scheduledCount} new show${result.scheduledCount === 1 ? "" : "s"} across ${result.screensConsidered} screen${result.screensConsidered === 1 ? "" : "s"}`,
      );
      setAutoDialogOpen(false);
    } catch (err) {
      setAutoError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Shows</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={openAutoSchedule}>
            Auto-schedule Shows
          </Button>
          <Button variant="contained" onClick={openCreate}>
            Add Show
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Movie</TableCell>
              <TableCell>Theatre / Screen</TableCell>
              <TableCell>Start Time</TableCell>
              <TableCell>End Time</TableCell>
              <TableCell>Prices</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading...</TableCell>
              </TableRow>
            )}
            {shows?.map((show) => (
              <TableRow key={show.id}>
                <TableCell>{show.movie.title}</TableCell>
                <TableCell>
                  {show.screen.theatre.name} / {show.screen.name}
                </TableCell>
                <TableCell>{new Date(show.startTime).toLocaleString()}</TableCell>
                <TableCell>{new Date(show.endTime).toLocaleString()}</TableCell>
                <TableCell>
                  {show.prices.map((p) => `${p.category}: ${p.price}`).join(", ")}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleDelete(show.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Show</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            select
            label="Movie"
            value={movieId}
            onChange={(e) => setMovieId(e.target.value)}
            fullWidth
          >
            {movies?.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Screen"
            value={screenId}
            onChange={(e) => setScreenId(e.target.value)}
            fullWidth
          >
            {allScreens.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.theatreName} / {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Start Time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <Typography variant="subtitle2">Prices per category (leave blank to omit)</Typography>
          {SEAT_CATEGORIES.map((c) => (
            <TextField
              key={c}
              label={c}
              type="number"
              value={prices[c]}
              onChange={(e) => setPrices({ ...prices, [c]: e.target.value })}
              fullWidth
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!movieId || !screenId || !startTime}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={autoDialogOpen} onClose={() => setAutoDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Auto-schedule Shows</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            For every screen with no upcoming show, one of the selected movies is assigned (round-robin) at a
            staggered future time over the next several days, using standard pricing. Not live showtime data — just
            a fast way to populate a schedule you've already decided on.
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="auto-schedule-movies-label">Movies</InputLabel>
            <Select
              labelId="auto-schedule-movies-label"
              multiple
              value={autoMovieIds}
              onChange={(e) => setAutoMovieIds(e.target.value as string[])}
              input={<OutlinedInput label="Movies" />}
              renderValue={(selected) =>
                (movies ?? [])
                  .filter((m) => selected.includes(m.id))
                  .map((m) => m.title)
                  .join(", ")
              }
            >
              {movies?.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  <Checkbox checked={autoMovieIds.includes(m.id)} />
                  <ListItemText primary={m.title} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAutoSchedule}
            disabled={autoMovieIds.length === 0 || autoSchedule.isLoading}
          >
            {autoSchedule.isLoading ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogActions>
      </Dialog>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
      <ErrorSnackbar message={autoError} onClose={() => setAutoError(null)} />
      <Snackbar open={!!autoSuccess} autoHideDuration={4000} onClose={() => setAutoSuccess(null)}>
        <Alert onClose={() => setAutoSuccess(null)} severity="success" sx={{ width: "100%" }}>
          {autoSuccess}
        </Alert>
      </Snackbar>
    </Box>
  );
}
