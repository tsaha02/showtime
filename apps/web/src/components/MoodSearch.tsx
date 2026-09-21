import { useState, type FormEvent } from "react";
import {
  Box,
  Card,
  CardContent,
  Stack,
  TextField,
  IconButton,
  Typography,
  Chip,
  CircularProgress,
  Grid,
  InputAdornment,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useAiSearchMutation } from "../store/api";
import { useAppDispatch } from "../store/hooks";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";

// A companion to the exact-match title/genre/city search bar below — this
// one hands a free-text mood/vibe description to Groq and gets back a
// short, explained shortlist instead of literal keyword matches. Kept to
// a single input row (the "AI Search" label lives inside the field as an
// adornment chip, not a heading above it) so it doesn't push the movie
// grid below the fold — a real complaint from testing the first version,
// which used a full card with its own heading/background/padding above
// the input. Results only take up space once the user has actually
// searched.
export function MoodSearch() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState("");
  const [aiSearch, { isLoading }] = useAiSearchMutation();
  const [results, setResults] = useState<
    { id: string; type: "movie" | "event"; title: string; reason: string }[] | null
  >(null);
  const [searched, setSearched] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const res = await aiSearch(query.trim()).unwrap();
      setResults(res);
      setSearched(true);
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    }
  };

  return (
    <Box sx={{ mb: { xs: 2.5, sm: 3 } }}>
      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          fullWidth
          size="small"
          placeholder='Describe a mood — "something funny for a first date"…'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputProps={{ maxLength: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Chip
                  icon={<AutoAwesomeIcon fontSize="small" />}
                  label="AI Search"
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ mr: 0.5 }}
                />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton type="submit" size="small" disabled={isLoading || !query.trim()} color="primary">
                  {isLoading ? <CircularProgress size={18} /> : <ArrowForwardIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {searched && (
        <Box sx={{ mt: 1.5 }}>
          {results === null ? (
            <Typography color="text.secondary" variant="body2">
              AI search isn't available right now — try the search bar below instead.
            </Typography>
          ) : results.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              Nothing matched that — try describing it differently.
            </Typography>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                AI-generated suggestions based on your description.
              </Typography>
              <Grid container spacing={1.5}>
                {results.map((r) => (
                  <Grid item xs={12} sm={6} key={`${r.type}-${r.id}`}>
                    <Card
                      variant="outlined"
                      sx={{ height: "100%", cursor: "pointer" }}
                      onClick={() => navigate(r.type === "movie" ? `/movies/${r.id}` : `/events/${r.id}`)}
                    >
                      <CardContent>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                          <Chip
                            label={r.type === "movie" ? "Movie" : "Event"}
                            size="small"
                            color={r.type === "movie" ? "primary" : "secondary"}
                            variant="outlined"
                          />
                          <Typography fontWeight={700} noWrap>
                            {r.title}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {r.reason}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
