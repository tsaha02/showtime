import { useParams, Link as RouterLink } from "react-router-dom";
import { Box, Grid, Typography, Chip, Stack, Skeleton, Alert, Button, Divider } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import { useGetDiscoverDetailQuery } from "../store/api";
import { getErrorMessage } from "../lib/apiError";

// Detail view for a movie found via SearchMoviesPage's OMDb-backed discover
// search. `imdbRating` here is OMDb's own IMDb rating — labeled explicitly
// as such so it's never confused with ShowTime's own user rating/review
// system shown on MovieDetailPage for bookable movies.
export function DiscoverDetailPage() {
  const { externalId = "" } = useParams();
  const { data, isLoading, isError, error } = useGetDiscoverDetailQuery(externalId);

  if (isLoading) {
    return (
      <Box>
        <Grid container spacing={4}>
          <Grid item xs={12} sm={5} md={4}>
            <Skeleton
              variant="rounded"
              sx={{
                width: { xs: "60%", sm: "100%" },
                maxWidth: { xs: 260, sm: "none" },
                mx: { xs: "auto", sm: 0 },
                aspectRatio: "2 / 3",
                borderRadius: 2,
              }}
            />
          </Grid>
          <Grid item xs={12} sm={7} md={8}>
            <Skeleton variant="text" width="60%" height={48} />
            <Stack direction="row" spacing={1} my={1}>
              <Skeleton variant="rounded" width={60} height={24} />
              <Skeleton variant="rounded" width={70} height={24} />
              <Skeleton variant="rounded" width={90} height={24} />
            </Stack>
            <Skeleton variant="text" width="40%" sx={{ mb: 2 }} />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" width="70%" />
            <Divider sx={{ my: 2 }} />
            <Skeleton variant="rounded" width={140} height={40} />
          </Grid>
        </Grid>
      </Box>
    );
  }
  if (isError || !data) {
    return <Alert severity="error">{getErrorMessage(error as any) ?? "Movie not found"}</Alert>;
  }

  const { details, localMovieId, bookable } = data;

  // OMDb returns "N/A" for fields it doesn't have, already converted to
  // `null` server-side — so these are conditionally rendered, not dumped
  // as a raw label list, to keep the "Details" section from looking sparse
  // or broken when a field is genuinely missing.
  const detailFields: { label: string; value: string | null }[] = [
    { label: "Director", value: details.director },
    { label: "Cast", value: details.actors },
    { label: "Language", value: details.language },
    { label: "Country", value: details.country },
    { label: "Awards", value: details.awards },
  ].filter((f) => f.value);

  return (
    <Box>
      <Grid container spacing={4}>
        <Grid item xs={12} sm={5} md={4}>
          <Box
            component="img"
            src={details.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
            alt={details.title}
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
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
            <Typography variant="h4">{details.title}</Typography>
            <Button
              component="a"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${details.title} trailer`)}`}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<PlayCircleOutlineIcon />}
              size="small"
              variant="outlined"
            >
              Watch Trailer
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} my={1} flexWrap="wrap" useFlexGap>
            {details.rated && <Chip label={details.rated} size="small" color="secondary" variant="outlined" />}
            {details.genre && <Chip label={details.genre} size="small" />}
            {details.durationMins != null && <Chip label={`${details.durationMins} mins`} size="small" />}
          </Stack>
          {details.imdbRating != null && (
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <StarIcon fontSize="small" sx={{ color: "#f5c518" }} />
              <Typography>
                {details.imdbRating.toFixed(1)} / 10 <Typography component="span" color="text.secondary">(IMDb Rating)</Typography>
              </Typography>
            </Box>
          )}
          <Typography paragraph color="text.secondary">
            {details.overview || "No synopsis available."}
          </Typography>

          {detailFields.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                Cast & Crew
              </Typography>
              <Grid container spacing={1.5} sx={{ mb: 1 }}>
                {detailFields.map((field) => (
                  <Grid item xs={12} sm={6} key={field.label}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {field.label}
                    </Typography>
                    <Typography variant="body2">{field.value}</Typography>
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          <Divider sx={{ my: 2 }} />

          {bookable && localMovieId ? (
            <Button component={RouterLink} to={`/movies/${localMovieId}`} variant="contained" size="large">
              Book Now
            </Button>
          ) : (
            <Alert severity="info">Not currently available for booking — check back later.</Alert>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
