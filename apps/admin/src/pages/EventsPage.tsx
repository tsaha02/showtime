import { useState } from "react";
import {
  Box,
  Button,
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
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import {
  useGetEventsQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
} from "../store/adminApi";
import type { EventDTO, EventInput, EventCategory } from "@showtime/shared";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

const EVENT_CATEGORIES: EventCategory[] = ["CONCERT", "COMEDY", "SPORTS", "THEATRE_PLAY", "WORKSHOP", "OTHER"];

const emptyForm: EventInput = {
  title: "",
  description: "",
  category: "CONCERT",
  durationMins: 90,
  posterUrl: "",
};

export default function EventsPage() {
  const { data: events, isLoading } = useGetEventsQuery();
  const [createEvent] = useCreateEventMutation();
  const [updateEvent] = useUpdateEventMutation();
  const [deleteEvent] = useDeleteEventMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventDTO | null>(null);
  const [form, setForm] = useState<EventInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(event: EventDTO) {
    setEditing(event);
    setForm({
      title: event.title,
      description: event.description,
      category: event.category,
      durationMins: event.durationMins,
      posterUrl: event.posterUrl ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const body: EventInput = { ...form, posterUrl: form.posterUrl || null };
      if (editing) {
        await updateEvent({ id: editing.id, body }).unwrap();
      } else {
        await createEvent(body).unwrap();
      }
      setDialogOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this event?")) return;
    try {
      await deleteEvent(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Events</Typography>
        <Button variant="contained" onClick={openCreate}>
          Add Event
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Poster URL</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5}>Loading...</TableCell>
              </TableRow>
            )}
            {events?.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{event.title}</TableCell>
                <TableCell>{event.category}</TableCell>
                <TableCell>{event.durationMins} min</TableCell>
                <TableCell
                  sx={{
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {event.posterUrl ?? "—"}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(event)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(event.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Event" : "Add Event"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            fullWidth
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            fullWidth
            multiline
            minRows={3}
          />
          <TextField
            select
            label="Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}
            fullWidth
          >
            {EVENT_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Duration (mins)"
            type="number"
            value={form.durationMins}
            onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
            fullWidth
          />
          <TextField
            label="Poster URL"
            value={form.posterUrl ?? ""}
            onChange={(e) => setForm({ ...form, posterUrl: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
    </Box>
  );
}
