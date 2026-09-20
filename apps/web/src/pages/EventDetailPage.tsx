import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Button,
  Divider,
  Stack,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { useGetEventQuery, useGetEventSessionsQuery, useGetIndiaCitiesQuery } from "../store/api";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import { setSelectedCity } from "../store/slices/locationSlice";
import { getErrorMessage } from "../lib/apiError";
import { eventCategoryLabel } from "../lib/eventCategoryLabel";

export function EventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // Same city-persistence pattern as MovieDetailPage: default to whatever
  // city was picked elsewhere in the app, but keep a local override so
  // browsing sessions here doesn't silently change Home's/EventsPage's city.
  const persistedCity = useAppSelector((s) => s.location.city);
  const [cityFilter, setCityFilter] = useState<string | null>(persistedCity);
  const { data: indiaCities } = useGetIndiaCitiesQuery();

  const { data: event, isLoading, isError, error } = useGetEventQuery(id);
  const { data: sessions } = useGetEventSessionsQuery({ eventId: id, city: cityFilter ?? undefined }, { skip: !id });

  const [formatFilter, setFormatFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const formatOptions = useMemo(
    () => Array.from(new Set((sessions ?? []).map((s) => s.format))).sort(),
    [sessions],
  );
  const languageOptions = useMemo(
    () => Array.from(new Set((sessions ?? []).map((s) => s.language))).sort(),
    [sessions],
  );

  // Group upcoming sessions by theatre, exactly like MovieDetailPage groups
  // shows by theatre, for a scannable list.
  const sessionsByTheatre = useMemo(() => {
    if (!sessions) return [];
    const filtered = sessions.filter(
      (session) =>
        (!formatFilter || session.format === formatFilter) &&
        (!languageFilter || session.language === languageFilter),
    );
    const byTheatre = new Map<string, typeof sessions>();
    for (const session of filtered) {
      const key = `${session.theatreName} — ${session.theatreCity}`;
      if (!byTheatre.has(key)) byTheatre.set(key, []);
      byTheatre.get(key)!.push(session);
    }
    return Array.from(byTheatre.entries());
  }, [sessions, formatFilter, languageFilter]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !event) {
    return <Alert severity="error">{getErrorMessage(error as any) ?? "Event not found"}</Alert>;
  }

  return (
    <Box>
      <Grid container spacing={4}>
        <Grid item xs={12} sm={5} md={4}>
          <Box
            component="img"
            src={event.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
            alt={event.title}
            sx={{
              width: { xs: "60%", sm: "100%" },
              maxWidth: { xs: 260, sm: "none" },
              display: "block",
              mx: { xs: "auto", sm: 0 },
              borderRadius: 2,
              boxShadow: "0 20px 40px -20px rgba(0,0,0,0.6)",
            }}
          />
        </Grid>
        <Grid item xs={12} sm={7} md={8}>
          <Typography variant="h4" gutterBottom>
            {event.title}
          </Typography>
          <Stack direction="row" spacing={1} my={1}>
            <Chip label={eventCategoryLabel(event.category)} size="small" />
            <Chip label={`${event.durationMins} mins`} size="small" />
          </Stack>
          <Typography paragraph color="text.secondary">
            {event.description}
          </Typography>
        </Grid>
      </Grid>

      <Divider sx={{ my: 4 }} />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Sessions</Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", sm: "center" }}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          <LocationOnIcon fontSize="small" color="primary" sx={{ display: { xs: "none", sm: "block" } }} />
          <Autocomplete
            size="small"
            options={indiaCities ?? []}
            value={cityFilter}
            onChange={(_e, value) => {
              setCityFilter(value);
              dispatch(setSelectedCity(value));
            }}
            sx={{ minWidth: { xs: "100%", sm: 220 } }}
            renderInput={(params) => (
              <TextField {...params} label="Showing city" placeholder="All cities" />
            )}
          />
          {cityFilter && (
            <Chip
              label="Show all cities"
              size="small"
              variant="outlined"
              onClick={() => {
                setCityFilter(null);
                dispatch(setSelectedCity(null));
              }}
            />
          )}
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 130 } }}>
            <InputLabel>Format</InputLabel>
            <Select label="Format" value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}>
              <MenuItem value="">All formats</MenuItem>
              {formatOptions.map((f) => (
                <MenuItem key={f} value={f}>
                  {f}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 150 } }}>
            <InputLabel>Language</InputLabel>
            <Select label="Language" value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
              <MenuItem value="">All languages</MenuItem>
              {languageOptions.map((l) => (
                <MenuItem key={l} value={l}>
                  {l}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {sessionsByTheatre.length === 0 && (sessions?.length ?? 0) > 0 && (
        <Typography color="text.secondary">
          {cityFilter
            ? `No upcoming sessions for this event in ${cityFilter}. Try "Show all cities".`
            : "No sessions match these filters."}
        </Typography>
      )}
      {(sessions?.length ?? 0) === 0 && (
        <Card variant="outlined" sx={{ maxWidth: 480 }}>
          <CardContent>
            <Typography color="text.secondary">No upcoming sessions for this event yet.</Typography>
          </CardContent>
        </Card>
      )}
      {sessionsByTheatre.map(([theatre, theatreSessions]) => (
        <Card key={theatre} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {theatre}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {theatreSessions.map((session) => (
                <Button
                  key={session.id}
                  variant="outlined"
                  onClick={() => navigate(`/shows/${session.id}/seats`)}
                >
                  {new Date(session.startTime).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {session.screenName}
                  {" · "}
                  {session.format}
                  {" · "}
                  {session.language}
                </Button>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
