import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Typography,
  Rating,
  Chip,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Button,
  Divider,
  Stack,
  TextField,
  List,
  ListItem,
  LinearProgress,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  IconButton,
} from "@mui/material";
import { MovieCard } from "../components/MovieCard";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import {
  useGetMovieQuery,
  useGetMovieShowsQuery,
  useGetMovieRatingsQuery,
  useCreateRatingMutation,
  useGetIndiaCitiesQuery,
  useJoinWaitlistMutation,
  useVoteRatingMutation,
  useGetSimilarMoviesQuery,
} from "../store/api";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import { setSelectedCity } from "../store/slices/locationSlice";
import { showToast } from "../store/slices/uiSlice";
import { getErrorMessage } from "../lib/apiError";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { JsonLd } from "../components/JsonLd";
import type { RatingDTO } from "@showtime/shared";

export function MovieDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();

  // Defaults to whatever city the user picked on Home (persisted in
  // locationSlice) so "I picked Mumbai, then opened this movie" shows
  // Mumbai's shows first — but this page keeps its own local override so
  // switching cities here (or clearing to "all cities") doesn't silently
  // change what Home shows next, only what this page's showtimes use.
  const persistedCity = useAppSelector((s) => s.location.city);
  const [cityFilter, setCityFilter] = useState<string | null>(persistedCity);
  const { data: indiaCities } = useGetIndiaCitiesQuery();

  const { data: movie, isLoading, isError, error } = useGetMovieQuery(id);
  useDocumentTitle(movie?.title ?? "Movie");
  const { data: similarMovies } = useGetSimilarMoviesQuery(id, { skip: !id });
  const { data: shows } = useGetMovieShowsQuery({ movieId: id, city: cityFilter ?? undefined });
  const [ratingsPage, setRatingsPage] = useState(1);
  const [shownRatings, setShownRatings] = useState<RatingDTO[]>([]);
  const { data: ratingsData } = useGetMovieRatingsQuery({ movieId: id, page: ratingsPage });
  const [createRating, { isLoading: isRating }] = useCreateRatingMutation();

  const [stars, setStars] = useState<number | null>(5);
  const [comment, setComment] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const [voteRating] = useVoteRatingMutation();

  const [formatFilter, setFormatFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const formatOptions = useMemo(
    () => Array.from(new Set((shows ?? []).map((s) => s.format))).sort(),
    [shows],
  );
  const languageOptions = useMemo(
    () => Array.from(new Set((shows ?? []).map((s) => s.language))).sort(),
    [shows],
  );

  const [waitlistEmail, setWaitlistEmail] = useState(user?.email ?? "");
  useEffect(() => {
    if (user?.email) setWaitlistEmail(user.email);
  }, [user?.email]);
  const [joinWaitlist, { isLoading: isJoiningWaitlist }] = useJoinWaitlistMutation();

  const handleJoinWaitlist = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(waitlistEmail)) {
      dispatch(showToast({ message: "Enter a valid email", severity: "warning" }));
      return;
    }
    try {
      await joinWaitlist({ movieId: id, email: waitlistEmail }).unwrap();
      dispatch(showToast({ message: "We'll email you!", severity: "success" }));
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    }
  };

  // Append each page's ratings onto the running list ("load more" rather
  // than a full pager), and reset back to page 1 whenever ratings are
  // invalidated (e.g. right after this user submits a new rating).
  useEffect(() => {
    if (!ratingsData) return;
    setShownRatings((prev) => (ratingsData.page === 1 ? ratingsData.ratings : [...prev, ...ratingsData.ratings]));
  }, [ratingsData]);

  const hasMoreRatings = !!ratingsData && shownRatings.length < ratingsData.total;

  // Group upcoming shows by theatre, then by date, for a scannable list.
  const showsByTheatre = useMemo(() => {
    if (!shows) return [];
    const filtered = shows.filter(
      (show) =>
        (!formatFilter || show.format === formatFilter) && (!languageFilter || show.language === languageFilter),
    );
    const byTheatre = new Map<string, typeof shows>();
    for (const show of filtered) {
      const key = `${show.theatreName} — ${show.theatreCity}`;
      if (!byTheatre.has(key)) byTheatre.set(key, []);
      byTheatre.get(key)!.push(show);
    }
    return Array.from(byTheatre.entries());
  }, [shows, formatFilter, languageFilter]);

  const handleRate = async (e: FormEvent) => {
    e.preventDefault();
    if (!stars) return;
    try {
      await createRating({ movieId: id, stars, comment: comment || undefined, isSpoiler }).unwrap();
      dispatch(showToast({ message: "Thanks for rating!", severity: "success" }));
      setComment("");
      setIsSpoiler(false);
      setRatingsPage(1);
    } catch (err: any) {
      dispatch(showToast({ message: getErrorMessage(err), severity: "error" }));
    }
  };

  const handleVote = async (ratingId: string, helpful: boolean) => {
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      const result = await voteRating({ ratingId, helpful }).unwrap();
      setShownRatings((prev) =>
        prev.map((r) =>
          r.id === ratingId
            ? { ...r, helpfulCount: result.helpfulCount, notHelpfulCount: result.notHelpfulCount, myVote: result.myVote }
            : r,
        ),
      );
    } catch (err) {
      dispatch(showToast({ message: getErrorMessage(err as any), severity: "error" }));
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !movie) {
    return <Alert severity="error">{getErrorMessage(error as any) ?? "Movie not found"}</Alert>;
  }

  return (
    <Box>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Movie",
          name: movie.title,
          description: movie.description,
          image: movie.posterUrl ?? undefined,
          genre: movie.genre,
          datePublished: movie.releaseDate,
          aggregateRating:
            movie.ratingCount > 0
              ? {
                  "@type": "AggregateRating",
                  ratingValue: movie.averageRating,
                  ratingCount: movie.ratingCount,
                  bestRating: 5,
                }
              : undefined,
        }}
      />
      <Grid container spacing={4}>
        <Grid item xs={12} sm={5} md={4}>
          <Box
            component="img"
            src={movie.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
            alt={movie.title}
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
            <Typography variant="h4">{movie.title}</Typography>
            <Button
              component="a"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${movie.title} trailer`)}`}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<PlayCircleOutlineIcon />}
              size="small"
              variant="outlined"
            >
              Watch Trailer
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} my={1}>
            <Chip label={movie.genre} size="small" />
            <Chip label={`${movie.durationMins} mins`} size="small" />
          </Stack>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Rating value={movie.averageRating} precision={0.5} readOnly />
            <Typography color="text.secondary">
              {movie.averageRating.toFixed(1)} ({movie.ratingCount} ratings)
            </Typography>
          </Box>
          <Typography paragraph color="text.secondary">
            {movie.description}
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
        <Typography variant="h5">Showtimes</Typography>
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
      {showsByTheatre.length === 0 && (shows?.length ?? 0) > 0 && (
        <Typography color="text.secondary">
          {cityFilter
            ? `No upcoming shows for this movie in ${cityFilter}. Try "Show all cities".`
            : "No shows match these filters."}
        </Typography>
      )}
      {(shows?.length ?? 0) === 0 && (
        <Card variant="outlined" sx={{ maxWidth: 480 }}>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              No upcoming shows for this movie yet.
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              Notify me when tickets are available
            </Typography>
            <Box component="form" onSubmit={handleJoinWaitlist}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  type="email"
                  placeholder="you@example.com"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  fullWidth
                  required
                />
                <Button type="submit" variant="contained" disabled={isJoiningWaitlist}>
                  Notify me
                </Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}
      {showsByTheatre.map(([theatre, theatreShows]) => (
        <Card key={theatre} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {theatre}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {theatreShows.map((show) => (
                <Button
                  key={show.id}
                  variant="outlined"
                  onClick={() => navigate(`/shows/${show.id}/seats`)}
                >
                  {new Date(show.startTime).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {show.screenName}
                  {" · "}
                  {show.format}
                  {" · "}
                  {show.language}
                </Button>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Divider sx={{ my: 4 }} />

      <Typography variant="h5" gutterBottom>
        Ratings & Reviews
      </Typography>

      {user && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Rate this movie
            </Typography>
            {/* Eligibility (must have a CONFIRMED booking for an ended show
                of this movie) is enforced server-side only — the form is
                shown to any logged-in user, and an ineligible attempt
                surfaces the server's 403 message via the toast. */}
            <Box component="form" onSubmit={handleRate}>
              <Stack spacing={2}>
                <Rating value={stars} onChange={(_e, v) => setStars(v)} />
                <TextField
                  label="Comment (optional)"
                  multiline
                  minRows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <FormControlLabel
                  control={<Checkbox checked={isSpoiler} onChange={(e) => setIsSpoiler(e.target.checked)} />}
                  label="Contains spoilers"
                />
                <Button type="submit" variant="contained" disabled={isRating} sx={{ alignSelf: "flex-start" }}>
                  Submit rating
                </Button>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}

      {ratingsData && ratingsData.total > 0 && (
        <Card variant="outlined" sx={{ mb: 3, maxWidth: 480 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              Rating breakdown
            </Typography>
            <Stack spacing={1}>
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = ratingsData.starCounts[star] ?? 0;
                const pct = ratingsData.total > 0 ? (count / ratingsData.total) * 100 : 0;
                return (
                  <Stack key={star} direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ width: 32 }}>
                      {star}★
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{ flex: 1, height: 8, borderRadius: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ width: 32, textAlign: "right" }}>
                      {count}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      <List>
        {shownRatings.map((r) => {
          const isOwnReview = !!user && user.id === r.userId;
          const isRevealed = revealedSpoilers[r.id];
          return (
            <ListItem key={r.id} alignItems="flex-start" divider sx={{ display: "block", py: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography fontWeight={600}>{r.userName}</Typography>
                <Rating value={r.stars} size="small" readOnly />
                {r.isSpoiler && <Chip label="Spoiler" size="small" color="warning" variant="outlined" />}
              </Stack>

              {r.comment && r.isSpoiler && !isRevealed ? (
                <Box
                  onClick={() => setRevealedSpoilers((prev) => ({ ...prev, [r.id]: true }))}
                  sx={{
                    position: "relative",
                    cursor: "pointer",
                    borderRadius: 1,
                    px: 1.5,
                    py: 1,
                    bgcolor: "action.hover",
                  }}
                >
                  <Typography sx={{ filter: "blur(6px)", userSelect: "none" }}>{r.comment}</Typography>
                  <Stack
                    alignItems="center"
                    justifyContent="center"
                    spacing={0.5}
                    sx={{ position: "absolute", inset: 0 }}
                  >
                    <VisibilityOffOutlinedIcon fontSize="small" />
                    <Typography variant="caption" fontWeight={600}>
                      This review contains spoilers — click to reveal
                    </Typography>
                  </Stack>
                </Box>
              ) : (
                r.comment && <Typography>{r.comment}</Typography>
              )}

              {!isOwnReview && (
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1 }}>
                  <IconButton
                    size="small"
                    color={r.myVote === true ? "primary" : "default"}
                    disabled={r.myVote === undefined}
                    onClick={() => handleVote(r.id, true)}
                    aria-label="Mark helpful"
                  >
                    {r.myVote === true ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />}
                  </IconButton>
                  <Typography variant="caption" color="text.secondary">
                    {r.helpfulCount}
                  </Typography>
                  <IconButton
                    size="small"
                    color={r.myVote === false ? "primary" : "default"}
                    disabled={r.myVote === undefined}
                    onClick={() => handleVote(r.id, false)}
                    aria-label="Mark not helpful"
                    sx={{ ml: 1 }}
                  >
                    {r.myVote === false ? (
                      <ThumbDownIcon fontSize="small" />
                    ) : (
                      <ThumbDownOutlinedIcon fontSize="small" />
                    )}
                  </IconButton>
                  <Typography variant="caption" color="text.secondary">
                    {r.notHelpfulCount}
                  </Typography>
                </Stack>
              )}
            </ListItem>
          );
        })}
        {ratingsData?.total === 0 && (
          <Typography color="text.secondary">No ratings yet — be the first!</Typography>
        )}
      </List>

      {hasMoreRatings && (
        <Button onClick={() => setRatingsPage((p) => p + 1)} sx={{ mt: 1 }}>
          Load more reviews
        </Button>
      )}

      {similarMovies && similarMovies.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          <Typography variant="h5" gutterBottom>
            You might also like
          </Typography>
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            {similarMovies.map((similar) => (
              <Grid item xs={6} sm={4} md={3} lg={2.4} key={similar.id}>
                <MovieCard movie={similar} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
}
