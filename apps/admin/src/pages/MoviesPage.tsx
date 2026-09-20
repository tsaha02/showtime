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
  IconButton,
  Typography,
  Chip,
  Tooltip,
  Card,
  CardContent,
  CardActions,
  Snackbar,
  Alert,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import {
  useGetMoviesQuery,
  useCreateMovieMutation,
  useUpdateMovieMutation,
  useDeleteMovieMutation,
  useLazySearchExternalMoviesQuery,
  useImportExternalMovieMutation,
  useBulkImportMoviesMutation,
  type MovieInput,
} from "../store/adminApi";
import type { MovieDTO } from "@showtime/shared";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

const emptyForm: MovieInput = {
  title: "",
  description: "",
  durationMins: 120,
  genre: "",
  posterUrl: "",
  releaseDate: new Date().toISOString().slice(0, 10),
};

export default function MoviesPage() {
  const { data: movies, isLoading } = useGetMoviesQuery();
  const [createMovie] = useCreateMovieMutation();
  const [updateMovie] = useUpdateMovieMutation();
  const [deleteMovie] = useDeleteMovieMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MovieDTO | null>(null);
  const [form, setForm] = useState<MovieInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [triggerSearchExternalMovies, externalSearch] = useLazySearchExternalMoviesQuery();
  const [importExternalMovie] = useImportExternalMovieMutation();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const [bulkImportMovies, bulkImport] = useBulkImportMoviesMutation();

  async function handleBulkImport() {
    try {
      const result = await bulkImportMovies().unwrap();
      setImportSuccess(
        `Populated ${result.importedCount} real movies` +
          (result.skippedCount ? ` (${result.skippedCount} titles not found on OMDb)` : ""),
      );
    } catch (err) {
      setImportError(extractErrorMessage(err));
    }
  }

  function openImportDialog() {
    setImportQuery("");
    setImportDialogOpen(true);
  }

  async function handleExternalSearch() {
    if (!importQuery.trim()) return;
    try {
      await triggerSearchExternalMovies(importQuery.trim()).unwrap();
    } catch (err) {
      setImportError(extractErrorMessage(err));
    }
  }

  async function handleExternalImport(externalId: string, title: string) {
    try {
      await importExternalMovie({ externalId }).unwrap();
      setImportSuccess(`Imported ${title}`);
    } catch (err) {
      setImportError(extractErrorMessage(err));
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(movie: MovieDTO) {
    setEditing(movie);
    setForm({
      title: movie.title,
      description: movie.description,
      durationMins: movie.durationMins,
      genre: movie.genre,
      posterUrl: movie.posterUrl ?? "",
      releaseDate: movie.releaseDate.slice(0, 10),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const body: MovieInput = { ...form, posterUrl: form.posterUrl || null };
      if (editing) {
        await updateMovie({ id: editing.id, body }).unwrap();
      } else {
        await createMovie(body).unwrap();
      }
      setDialogOpen(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this movie?")) return;
    try {
      await deleteMovie(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Movies</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Resolves ~65 well-known real titles through OMDb in one go — useful for a catalog that's more than a handful of movies. OMDb has no 'trending now' endpoint, so this is a curated list, not a live feed.">
            <span>
              <Button
                variant="outlined"
                onClick={handleBulkImport}
                disabled={bulkImport.isLoading}
              >
                {bulkImport.isLoading ? "Populating…" : "Populate Popular Movies"}
              </Button>
            </span>
          </Tooltip>
          <Button variant="outlined" startIcon={<MovieFilterIcon />} onClick={openImportDialog}>
            Import Movie
          </Button>
          <Button variant="contained" onClick={openCreate}>
            Add Movie
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Genre</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Release Date</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>Loading...</TableCell>
              </TableRow>
            )}
            {movies?.map((movie) => (
              <TableRow key={movie.id}>
                <TableCell>
                  {movie.title}
                  {movie.externalId && (
                    <Tooltip title="Imported via OMDb">
                      <Chip label="Imported" size="small" sx={{ ml: 1 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>{movie.genre}</TableCell>
                <TableCell>{movie.durationMins} min</TableCell>
                <TableCell>{movie.releaseDate.slice(0, 10)}</TableCell>
                <TableCell>
                  {movie.averageRating.toFixed(1)} ({movie.ratingCount})
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(movie)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(movie.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit Movie" : "Add Movie"}</DialogTitle>
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
            label="Duration (mins)"
            type="number"
            value={form.durationMins}
            onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
            fullWidth
          />
          <TextField
            label="Genre"
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
            fullWidth
          />
          <TextField
            label="Poster URL"
            value={form.posterUrl ?? ""}
            onChange={(e) => setForm({ ...form, posterUrl: e.target.value })}
            fullWidth
          />
          <TextField
            label="Release Date"
            type="date"
            value={form.releaseDate}
            onChange={(e) => setForm({ ...form, releaseDate: e.target.value })}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Import Movie</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Search via OMDb
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label="Search movies"
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleExternalSearch();
              }}
              fullWidth
              autoFocus
            />
            <Button variant="contained" onClick={handleExternalSearch} disabled={externalSearch.isFetching}>
              Search
            </Button>
          </Box>

          {externalSearch.isFetching && <Typography>Searching...</Typography>}

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {externalSearch.data?.results.map((result) => {
              const year = result.releaseDate ? result.releaseDate.slice(0, 4) : "Unknown";
              return (
                <Card key={result.externalId} sx={{ width: 220 }}>
                  {result.posterUrl ? (
                    <Box
                      component="img"
                      src={result.posterUrl}
                      alt={result.title}
                      sx={{ width: "100%", height: 260, objectFit: "cover" }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: "100%",
                        height: 260,
                        bgcolor: "grey.300",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        No poster
                      </Typography>
                    </Box>
                  )}
                  <CardContent>
                    <Typography variant="subtitle2">
                      {result.title} ({year})
                    </Typography>
                    {result.overview && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {result.overview}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={() => handleExternalImport(result.externalId, result.title)}>
                      Import
                    </Button>
                  </CardActions>
                </Card>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
      <ErrorSnackbar message={importError} onClose={() => setImportError(null)} />
      <Snackbar open={!!importSuccess} autoHideDuration={4000} onClose={() => setImportSuccess(null)}>
        <Alert onClose={() => setImportSuccess(null)} severity="success" sx={{ width: "100%" }}>
          {importSuccess}
        </Alert>
      </Snackbar>
    </Box>
  );
}
