import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Grid,
  Card,
  CardActionArea,
  CardMedia,
  CardContent,
  Typography,
  TextField,
  Box,
  CircularProgress,
  Alert,
  Chip,
  Rating,
  InputAdornment,
  MenuItem,
  Stack,
  Autocomplete,
  IconButton,
  Tooltip,
  Skeleton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import {
  useGetMoviesQuery,
  useGetGenresQuery,
  useGetCitiesQuery,
  useGetIndiaCitiesQuery,
  useGetTheatresQuery,
  useLazyReverseGeocodeQuery,
} from "../store/api";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setSelectedCity } from "../store/slices/locationSlice";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const ALL = "__all__";

export function HomePage() {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [genre, setGenre] = useState(ALL);
  // The selected city lives in a persisted Redux slice (not local state)
  // so that MovieDetailPage can default its showtimes to it after
  // navigating away from Home — see locationSlice.ts.
  const city = useAppSelector((s) => s.location.city);
  const setCity = (value: string | null) => dispatch(setSelectedCity(value));
  const [locating, setLocating] = useState(false);

  const { data: genres } = useGetGenresQuery();
  // `serviceableCities` (from /theatres/cities) is the small list of cities
  // ShowTime actually operates in — it drives the "we don't serve this city
  // yet" fallback and its quick-pick suggestions. `indiaCities` (from
  // /locations/india-cities) is a much larger real-world list used only to
  // power the Autocomplete's free-text search, so picking a real city like
  // "Siliguri" that ShowTime doesn't serve is allowed, and handled gracefully.
  const { data: serviceableCities } = useGetCitiesQuery();
  const { data: indiaCities } = useGetIndiaCitiesQuery();
  const { data: theatres } = useGetTheatresQuery();
  const [reverseGeocode] = useLazyReverseGeocodeQuery();
  const theatresInCity = city ? (theatres ?? []).filter((t) => t.city === city) : [];
  const {
    data: movies,
    isLoading,
    isError,
    error,
  } = useGetMoviesQuery({
    search: debouncedSearch || undefined,
    genre: genre === ALL ? undefined : genre,
    city: city ?? undefined,
    bookable: true,
  });

  const hasFilters = genre !== ALL || !!city;
  const cityIsServiceable = !city || (serviceableCities ?? []).includes(city);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      dispatch(showToast({ message: "Geolocation isn't supported by your browser", severity: "warning" }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const resolvedCity = await reverseGeocode({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          }).unwrap();
          if (resolvedCity) {
            setCity(resolvedCity);
            dispatch(showToast({ message: `Location set to ${resolvedCity}`, severity: "success" }));
          } else {
            dispatch(showToast({ message: "Couldn't determine your city from your location", severity: "warning" }));
          }
        } catch (err: any) {
          dispatch(showToast({ message: getErrorMessage(err), severity: "error" }));
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        const message =
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission denied"
            : "Couldn't get your location";
        dispatch(showToast({ message, severity: "warning" }));
      },
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: { xs: 2, sm: 3 } }}>
        Now Showing
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search movies by title…"
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
          label="Genre"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          fullWidth
          sx={{ flex: 1, minWidth: { md: 160 } }}
        >
          <MenuItem value={ALL}>All genres</MenuItem>
          {genres?.map((g) => (
            <MenuItem key={g} value={g}>
              {g}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={0.5} sx={{ flex: 1, minWidth: { md: 220 } }} alignItems="center">
          <Autocomplete
            fullWidth
            options={indiaCities ?? []}
            value={city}
            onChange={(_e, value) => setCity(value)}
            loading={!indiaCities}
            renderInput={(params) => <TextField {...params} label="Now showing in" placeholder="All cities" />}
          />
          <Tooltip title="Use my location">
            <span>
              <IconButton onClick={handleUseMyLocation} disabled={locating} color="primary">
                {locating ? <CircularProgress size={20} /> : <MyLocationIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {hasFilters && (
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          {genre !== ALL && <Chip label={`Genre: ${genre}`} onDelete={() => setGenre(ALL)} size="small" />}
          {city && <Chip label={`City: ${city}`} onDelete={() => setCity(null)} size="small" />}
        </Stack>
      )}

      {city && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Theatres in {city}
          </Typography>
          {theatresInCity.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No theatres found in {city}.
            </Typography>
          ) : (
            <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 1 }}>
              {theatresInCity.map((theatre) => (
                <Card key={theatre.id} variant="outlined" sx={{ minWidth: 220, flexShrink: 0 }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <LocationOnIcon color="primary" fontSize="small" sx={{ mt: 0.3 }} />
                      <Box>
                        <Typography variant="subtitle2">{theatre.name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {theatre.address}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {isError && <Alert severity="error">{getErrorMessage(error as any)}</Alert>}
      {!isLoading && !isError && movies?.length === 0 && city && !cityIsServiceable && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography gutterBottom>ShowTime doesn't have theatres in {city} yet.</Typography>
          {serviceableCities && serviceableCities.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
              {serviceableCities.map((c) => (
                <Chip key={c} label={c} size="small" onClick={() => setCity(c)} clickable />
              ))}
            </Stack>
          )}
        </Alert>
      )}
      {!isLoading && !isError && movies?.length === 0 && (!city || cityIsServiceable) && (
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
          <MovieFilterIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            No movies match your filters
          </Typography>
          <Typography color="text.secondary">Try clearing the search, genre, or city.</Typography>
        </Box>
      )}

      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {isLoading &&
          Array.from({ length: 10 }).map((_, i) => (
            <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}>
              <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
              <Skeleton variant="text" sx={{ mt: 1 }} />
              <Skeleton variant="text" width="60%" />
            </Grid>
          ))}
        {movies?.map((movie) => (
          <Grid item xs={6} sm={4} md={3} lg={2.4} key={movie.id}>
            <Card
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                "&:hover": {
                  transform: { xs: "none", sm: "translateY(-4px)" },
                  boxShadow: "0 16px 32px -12px rgba(0,0,0,0.5)",
                  borderColor: "primary.main",
                },
              }}
            >
              <CardActionArea component={RouterLink} to={`/movies/${movie.id}`} sx={{ height: "100%" }}>
                <CardMedia
                  component="img"
                  image={movie.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
                  alt={movie.title}
                  sx={{ aspectRatio: "2 / 3", objectFit: "cover" }}
                />
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} noWrap>
                    {movie.title}
                  </Typography>
                  <Chip label={movie.genre} size="small" sx={{ mb: 1, mt: 0.5 }} />
                  <Box display="flex" alignItems="center" gap={1}>
                    <Rating value={movie.averageRating} precision={0.5} size="small" readOnly />
                    <Typography variant="body2" color="text.secondary">
                      ({movie.ratingCount})
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {movie.durationMins} mins
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
