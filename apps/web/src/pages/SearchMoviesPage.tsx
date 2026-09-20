import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Grid,
  Card,
  CardActionArea,
  CardMedia,
  CardContent,
  Alert,
  Chip,
  Stack,
  Skeleton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import StarIcon from "@mui/icons-material/Star";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
  useDiscoverMoviesQuery,
  useGetTrendingMoviesQuery,
} from "../store/api";
import { getErrorMessage } from "../lib/apiError";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import type {
  ExternalMovieDetailsDTO,
  ExternalMovieSearchResultDTO,
} from "@showtime/shared";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
// Deliberately separate from HomePage's "Now Showing": this page browses
// ANY real movie via OMDb (posters, synopsis, IMDb rating), independent of
// whether ShowTime can actually sell you a ticket for it. Booking is only
// ever confirmed on the detail view, not implied here.
export function SearchMoviesPage() {
  useDocumentTitle("Search Movies");
  const [query, setQuery] = useState("");
  // The input itself updates every keystroke; the actual OMDb search only
  // fires once typing pauses, so a fast typist doesn't fire a request per
  // letter — see useDebouncedValue.ts.
  const debouncedQuery = useDebouncedValue(query);
  const hasQuery = debouncedQuery.trim().length >= 2;
  const {
    data: results,
    isFetching,
    isError,
    error,
  } = useDiscoverMoviesQuery(debouncedQuery, { skip: !hasQuery });
  const { data: trending, isFetching: isTrendingLoading } =
    useGetTrendingMoviesQuery();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Search Movies
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Browse any movie, not just what's currently bookable on ShowTime.
      </Typography>
      <TextField
        fullWidth
        placeholder="Search for any movie title…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 4 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {!hasQuery && (
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <TrendingUpIcon color="secondary" />
            <Typography variant="h5">Trending Now</Typography>
          </Stack>
          <MovieResultsGrid
            movies={trending}
            isLoading={isTrendingLoading}
            emptyMessage="Trending titles aren't available right now."
          />
        </Box>
      )}

      {hasQuery && (
        <Box>
          <Typography variant="h5" gutterBottom>
            Results for "{query}"
          </Typography>
          {isError && (
            <Alert severity="error">{getErrorMessage(error as any)}</Alert>
          )}
          {!isFetching && !isError && results?.length === 0 && (
            <Typography color="text.secondary">
              No movies found for "{query}".
            </Typography>
          )}
          <MovieResultsGrid movies={results} isLoading={isFetching} />
        </Box>
      )}
      {query.trim().length > 0 && query.trim().length < 2 && (
        <Typography color="text.secondary">Keep typing to search…</Typography>
      )}
    </Box>
  );
}

function MovieResultsGrid({
  movies,
  isLoading,
  emptyMessage,
}: {
  movies:
    (ExternalMovieSearchResultDTO | ExternalMovieDetailsDTO)[] | undefined;
  isLoading: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return (
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Grid item xs={6} sm={4} md={3} lg={2.4} key={i}>
            <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
            <Skeleton variant="text" sx={{ mt: 1 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!isLoading && movies?.length === 0 && emptyMessage) {
    return <Typography color="text.secondary">{emptyMessage}</Typography>;
  }

  return (
    <Grid container spacing={{ xs: 2, sm: 3 }}>
      {movies?.map((movie) => {
        const imdbRating = "imdbRating" in movie ? movie.imdbRating : null;
        return (
          <Grid item xs={6} sm={4} md={3} lg={2.4} key={movie.externalId}>
            <Card
              sx={{
                height: "100%",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: "0 16px 32px -12px rgba(0,0,0,0.5)",
                  borderColor: "primary.main",
                },
              }}
            >
              <CardActionArea
                component={RouterLink}
                to={`/discover/${movie.externalId}`}
                sx={{ height: "100%" }}
              >
                <Box sx={{ position: "relative" }}>
                  <CardMedia
                    component="img"
                    image={
                      movie.posterUrl ??
                      "https://placehold.co/300x450?text=No+Poster"
                    }
                    alt={movie.title}
                    sx={{ aspectRatio: "2 / 3", objectFit: "cover" }}
                  />
                  {imdbRating != null && (
                    <Chip
                      icon={
                        <StarIcon
                          sx={{ fontSize: 14, color: "#1a1a1a !important" }}
                        />
                      }
                      label={imdbRating.toFixed(1)}
                      size="small"
                      color="secondary"
                      sx={{ position: "absolute", top: 8, right: 8 }}
                    />
                  )}
                </Box>
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={700} noWrap>
                    {movie.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {movie.releaseDate
                      ? new Date(movie.releaseDate).getFullYear()
                      : "Unknown year"}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );
}
