import { useState } from "react";
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent,
  CardActions,
  Snackbar,
  Alert,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import GridViewIcon from "@mui/icons-material/GridView";
import PublicIcon from "@mui/icons-material/Public";
import { Link as RouterLink } from "react-router-dom";
import {
  useGetTheatresQuery,
  useCreateTheatreMutation,
  useDeleteTheatreMutation,
  useCreateScreenMutation,
  useDeleteScreenMutation,
  useLazySearchDiscoveredTheatresQuery,
  useImportDiscoveredTheatreMutation,
  type TheatreInput,
} from "../store/adminApi";
import ErrorSnackbar from "../components/ErrorSnackbar";
import { extractErrorMessage } from "../lib/errors";

const emptyForm: TheatreInput = { name: "", city: "", address: "" };

export default function TheatresPage() {
  const { data: theatres, isLoading } = useGetTheatresQuery();
  const [createTheatre] = useCreateTheatreMutation();
  const [deleteTheatre] = useDeleteTheatreMutation();
  const [createScreen] = useCreateScreenMutation();
  const [deleteScreen] = useDeleteScreenMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TheatreInput>(emptyForm);
  const [screenNameByTheatre, setScreenNameByTheatre] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false);
  const [discoverCity, setDiscoverCity] = useState("");
  const [triggerSearchDiscoveredTheatres, discoverSearch] = useLazySearchDiscoveredTheatresQuery();
  const [importDiscoveredTheatre] = useImportDiscoveredTheatreMutation();
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverSuccess, setDiscoverSuccess] = useState<string | null>(null);

  async function handleCreateTheatre() {
    try {
      await createTheatre(form).unwrap();
      setDialogOpen(false);
      setForm(emptyForm);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDeleteTheatre(id: string) {
    if (!confirm("Delete this theatre? This also removes its screens and shows.")) return;
    try {
      await deleteTheatre(id).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleAddScreen(theatreId: string) {
    const name = screenNameByTheatre[theatreId]?.trim();
    if (!name) return;
    try {
      await createScreen({ theatreId, name }).unwrap();
      setScreenNameByTheatre({ ...screenNameByTheatre, [theatreId]: "" });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  async function handleDeleteScreen(theatreId: string, screenId: string) {
    if (!confirm("Delete this screen?")) return;
    try {
      await deleteScreen({ theatreId, screenId }).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  function openDiscoverDialog() {
    setDiscoverCity("");
    setDiscoverDialogOpen(true);
  }

  async function handleDiscoverSearch() {
    if (!discoverCity.trim()) return;
    try {
      await triggerSearchDiscoveredTheatres(discoverCity.trim()).unwrap();
    } catch (err) {
      setDiscoverError(extractErrorMessage(err));
    }
  }

  async function handleDiscoverImport(osmId: string, name: string, address: string | null) {
    try {
      await importDiscoveredTheatre({ osmId, name, address, city: discoverCity.trim() }).unwrap();
      setDiscoverSuccess(`Imported ${name}`);
    } catch (err) {
      setDiscoverError(extractErrorMessage(err));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Theatres</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" startIcon={<PublicIcon />} onClick={openDiscoverDialog}>
            Import Real Theatre
          </Button>
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            Add Theatre
          </Button>
        </Box>
      </Box>

      {isLoading && <Typography>Loading...</Typography>}

      {theatres?.map((theatre) => (
        <Accordion key={theatre.id} sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", pr: 2 }}>
              <Box>
                <Typography variant="subtitle1">{theatre.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {theatre.city} — {theatre.address}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTheatre(theatre.id);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Screens
            </Typography>
            <List dense>
              {theatre.screens.map((screen) => (
                <Box key={screen.id}>
                  <ListItem
                    secondaryAction={
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <IconButton
                          size="small"
                          component={RouterLink}
                          to={`/theatres/${theatre.id}/screens/${screen.id}/layout`}
                          title="Edit seat layout"
                        >
                          <GridViewIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteScreen(theatre.id, screen.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    }
                  >
                    <ListItemText primary={screen.name} />
                  </ListItem>
                  <Divider />
                </Box>
              ))}
              {theatre.screens.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
                  No screens yet.
                </Typography>
              )}
            </List>
            <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
              <TextField
                size="small"
                label="New screen name"
                value={screenNameByTheatre[theatre.id] ?? ""}
                onChange={(e) => setScreenNameByTheatre({ ...screenNameByTheatre, [theatre.id]: e.target.value })}
              />
              <Button variant="outlined" onClick={() => handleAddScreen(theatre.id)}>
                Add Screen
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Theatre</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
          <TextField
            label="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            fullWidth
          />
          <TextField
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateTheatre}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={discoverDialogOpen} onClose={() => setDiscoverDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Import Real Theatre</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Search via OpenStreetMap
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label="City"
              value={discoverCity}
              onChange={(e) => setDiscoverCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDiscoverSearch();
              }}
              fullWidth
              autoFocus
            />
            <Button variant="contained" onClick={handleDiscoverSearch} disabled={discoverSearch.isFetching}>
              Search
            </Button>
          </Box>

          {discoverSearch.isFetching && <Typography>Searching (this can take a couple seconds)...</Typography>}

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {discoverSearch.data?.results.map((result) => (
              <Card key={result.osmId} sx={{ width: 260 }}>
                <CardContent>
                  <Typography variant="subtitle2">{result.name}</Typography>
                  {result.address && (
                    <Typography variant="body2" color="text.secondary">
                      {result.address}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    via OpenStreetMap
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => handleDiscoverImport(result.osmId, result.name, result.address)}
                  >
                    Import
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscoverDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ErrorSnackbar message={error} onClose={() => setError(null)} />
      <ErrorSnackbar message={discoverError} onClose={() => setDiscoverError(null)} />
      <Snackbar open={!!discoverSuccess} autoHideDuration={4000} onClose={() => setDiscoverSuccess(null)}>
        <Alert onClose={() => setDiscoverSuccess(null)} severity="success" sx={{ width: "100%" }}>
          {discoverSuccess}
        </Alert>
      </Snackbar>
    </Box>
  );
}
