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
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { SEAT_CATEGORIES, type SeatCategory } from "@showtime/shared";
import {
  useGetEventSessionsQuery,
  useGetEventsQuery,
  useGetTheatresQuery,
  useCreateEventSessionMutation,
  useDeleteEventSessionMutation,
} from "../store/adminApi";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

export default function EventSessionsPage() {
  const { data: sessions, isLoading } = useGetEventSessionsQuery();
  const { data: events } = useGetEventsQuery();
  const { data: theatres } = useGetTheatresQuery();
  const [createEventSession] = useCreateEventSessionMutation();
  const [deleteEventSession] = useDeleteEventSessionMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [screenId, setScreenId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [format, setFormat] = useState("2D");
  const [language, setLanguage] = useState("English");
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
    setEventId("");
    setScreenId("");
    setStartTime("");
    setFormat("2D");
    setLanguage("English");
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
      await createEventSession({
        eventId,
        screenId,
        startTime: new Date(startTime).toISOString(),
        format,
        language,
        prices: priceEntries,
      }).unwrap();
      setDialogOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this session?")) return;
    try {
      await deleteEventSession(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Event Sessions</Typography>
        <Button variant="contained" onClick={openCreate}>
          Schedule Session
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Event</TableCell>
              <TableCell>Theatre / Screen</TableCell>
              <TableCell>Start Time</TableCell>
              <TableCell>End Time</TableCell>
              <TableCell>Format / Language</TableCell>
              <TableCell>Prices</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7}>Loading...</TableCell>
              </TableRow>
            )}
            {sessions?.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{session.event.title}</TableCell>
                <TableCell>
                  {session.screen.theatre.name} / {session.screen.name}
                </TableCell>
                <TableCell>{new Date(session.startTime).toLocaleString()}</TableCell>
                <TableCell>{new Date(session.endTime).toLocaleString()}</TableCell>
                <TableCell>
                  {session.format} / {session.language}
                </TableCell>
                <TableCell>
                  {session.prices.map((p) => `${p.category}: ${p.price}`).join(", ")}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleDelete(session.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Schedule Session</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            select
            label="Event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            fullWidth
          >
            {events?.map((ev) => (
              <MenuItem key={ev.id} value={ev.id}>
                {ev.title}
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
          <TextField
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            fullWidth
          />
          <TextField
            label="Language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            fullWidth
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
          <Button variant="contained" onClick={handleCreate} disabled={!eventId || !screenId || !startTime}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  );
}
