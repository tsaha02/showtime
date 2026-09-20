import { useState } from "react";
import {
  Grid,
  Typography,
  TextField,
  Box,
  Alert,
  InputAdornment,
  MenuItem,
  Stack,
  Skeleton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import { useGetEventsQuery } from "../store/api";
import { useAppSelector } from "../store/hooks";
import { getErrorMessage } from "../lib/apiError";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { EventCard } from "../components/EventCard";
import { eventCategoryLabel } from "../lib/eventCategoryLabel";
import type { EventCategory } from "@showtime/shared";

const ALL = "__all__";
const CATEGORIES: EventCategory[] = ["CONCERT", "COMEDY", "SPORTS", "THEATRE_PLAY", "WORKSHOP", "OTHER"];

export function EventsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [category, setCategory] = useState(ALL);
  // Same persisted city as HomePage's movie browsing, so a city picked
  // there also narrows which events show as bookable here.
  const city = useAppSelector((s) => s.location.city);

  const {
    data: events,
    isLoading,
    isError,
    error,
  } = useGetEventsQuery({
    search: debouncedSearch || undefined,
    category: category === ALL ? undefined : category,
    city: city ?? undefined,
    bookable: true,
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: { xs: 2, sm: 3 } }}>
        Events
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Concerts, comedy nights, plays and more — booked the exact same way as a movie showtime.
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          placeholder="Search events by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          sx={{ flex: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          fullWidth
          sx={{ flex: 1, minWidth: { md: 180 } }}
        >
          <MenuItem value={ALL}>All categories</MenuItem>
          {CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {eventCategoryLabel(c)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {isError && <Alert severity="error">{getErrorMessage(error as any)}</Alert>}

      {!isLoading && !isError && events?.length === 0 && (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            px: 2,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 3,
          }}
        >
          <TheaterComedyIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            No events match your filters
          </Typography>
          <Typography color="text.secondary">Try clearing the search or category.</Typography>
        </Box>
      )}

      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}>
              <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
              <Skeleton variant="text" sx={{ mt: 1 }} />
              <Skeleton variant="text" width="60%" />
            </Grid>
          ))}
        {events?.map((event) => (
          <Grid item xs={6} sm={4} md={3} lg={2.4} key={event.id}>
            <EventCard event={event} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
