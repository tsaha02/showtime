import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Typography,
  Rating,
  Chip,
  Alert,
  Card,
  CardContent,
  Button,
  Divider,
  Stack,
  TextField,
  LinearProgress,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  IconButton,
  Avatar,
  Paper,
  Skeleton,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import { MovieCard } from "../components/MovieCard";
import { ShowtimeSlot } from "../components/ShowtimeSlot";
import { ctaTapProps, fadeInUpSmall, usePrefersReducedMotion, viewportFadeInProps } from "../lib/motion";

const MotionButton = motion.create(Button);
import LocationOnIcon from "@mui/icons-material/LocationOn";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbDownOutlinedIcon from "@mui/icons-material/ThumbDownOutlined";
import ThumbDownIcon from "@mui/icons-material/ThumbDown";
import LocalActivityOutlinedIcon from "@mui/icons-material/LocalActivityOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import RecommendOutlinedIcon from "@mui/icons-material/RecommendOutlined";
import StarIcon from "@mui/icons-material/Star";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import {
  useGetMovieQuery,
  useGetMovieShowsQuery,
  useGetMovieRatingsQuery,
  useCreateRatingMutation,
  useGetIndiaCitiesQuery,
  useJoinWaitlistMutation,
  useVoteRatingMutation,
  useGetSimilarMoviesQuery,
  useGetReviewSummaryQuery,
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
  const prefersReducedMotion = usePrefersReducedMotion();

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
  const { data: reviewSummary } = useGetReviewSummaryQuery(id, { skip: !id });
  const { data: shows } = useGetMovieShowsQuery({ movieId: id, city: cityFilter ?? undefined });
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
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
      <Box>
        {/* Hero: poster + title/meta, mirroring the loaded layout's Grid split. */}
        <Box
          sx={{
            position: "relative",
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            p: { xs: 2.5, sm: 3, md: 4 },
            mb: 4,
            overflow: "hidden",
          }}
        >
          <Grid container spacing={4}>
            <Grid item xs={12} sm={4} md={3}>
              <Skeleton
                variant="rounded"
                sx={{
                  width: { xs: "50%", sm: "100%" },
                  maxWidth: { xs: 200, sm: 240 },
                  mx: { xs: "auto", sm: 0 },
                  aspectRatio: "2 / 3",
                  borderRadius: 2,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={8} md={9}>
              <Skeleton variant="text" width="70%" height={56} sx={{ mb: 1 }} />
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Skeleton variant="rounded" width={90} height={24} />
                <Skeleton variant="rounded" width={70} height={24} />
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
                <Skeleton variant="text" width={60} />
                <Skeleton variant="rounded" width={130} height={32} />
              </Stack>
              <Skeleton variant="text" />
              <Skeleton variant="text" />
              <Skeleton variant="text" width="80%" />
            </Grid>
          </Grid>
        </Box>

        {/* Showtimes section header */}
        <Skeleton variant="text" width={160} height={36} sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Skeleton variant="text" width="60%" sx={{ mb: 1 }} />
                  <Stack spacing={1}>
                    <Skeleton variant="rounded" height={36} />
                    <Skeleton variant="rounded" height={36} />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: 4 }} />

        {/* Ratings & reviews section */}
        <Skeleton variant="text" width={220} height={36} sx={{ mb: 2 }} />
        <Stack spacing={1.5}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Skeleton variant="circular" width={36} height={36} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="30%" />
                  <Skeleton variant="text" width="20%" />
                </Box>
              </Stack>
              <Skeleton variant="text" />
              <Skeleton variant="text" width="70%" />
            </Paper>
          ))}
        </Stack>
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
      <Box
        sx={{
          position: "relative",
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          p: { xs: 2.5, sm: 3, md: 4 },
          mb: 3,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <Grid container spacing={4}>
          <Grid item xs={12} sm={4} md={3}>
            <Box
              component="img"
              src={movie.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
              alt={movie.title}
              sx={{
                width: { xs: "50%", sm: "100%" },
                maxWidth: { xs: 200, sm: 240 },
                display: "block",
                mx: { xs: "auto", sm: 0 },
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 20px 40px -20px rgba(0,0,0,0.6)",
              }}
            />
          </Grid>
          <Grid item xs={12} sm={8} md={9}>
            <Typography variant="h3" fontWeight={800} sx={{ fontSize: { xs: "1.9rem", sm: "2.4rem" } }} gutterBottom>
              {movie.title}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip label={movie.genre} size="small" color="secondary" variant="outlined" />
              <Chip label={`${movie.durationMins} mins`} size="small" variant="outlined" />
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <StarIcon fontSize="small" sx={{ color: "secondary.main" }} />
                <Typography fontWeight={700}>{movie.averageRating.toFixed(1)}</Typography>
                <Typography color="text.secondary" variant="body2">
                  ({movie.ratingCount} rating{movie.ratingCount === 1 ? "" : "s"})
                </Typography>
              </Stack>
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
            {/* Collapsed to a few lines by default rather than the full
                synopsis — a long OMDb-sourced description used to push
                Showtimes (the actual reason anyone's on this page) well
                below the fold. The poster is a secondary visual cue, not
                the point of a booking flow; this keeps it present without
                letting it (or a wall of plot summary) dominate the first
                screen. */}
            <Typography
              color="text.secondary"
              sx={{
                lineHeight: 1.7,
                ...(descriptionExpanded
                  ? {}
                  : {
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }),
              }}
            >
              {movie.description}
            </Typography>
            <Button
              size="small"
              onClick={() => setDescriptionExpanded((v) => !v)}
              sx={{ mt: 0.5, px: 0, minWidth: 0 }}
            >
              {descriptionExpanded ? "Show less" : "Read more"}
            </Button>
          </Grid>
        </Grid>
      </Box>

      <Box
        component={motion.div}
        {...viewportFadeInProps(prefersReducedMotion, fadeInUpSmall)}
      >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <LocalActivityOutlinedIcon color="primary" />
          <Typography variant="h5">Showtimes</Typography>
        </Stack>
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
      </Box>
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
                <MotionButton
                  type="submit"
                  variant="contained"
                  disabled={isJoiningWaitlist}
                  {...ctaTapProps(prefersReducedMotion)}
                >
                  Notify me
                </MotionButton>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}
      {/* A grid of narrower cards, not one full-width card per theatre —
          a theatre with only one or two showtimes used to sit in a card
          spanning the whole page width, leaving a large empty void next
          to a single small button (the specific "doesn't look good"
          complaint this replaced). Buttons stack vertically and go
          full-width within each card, which reads better at this
          narrower size than the old wrapped horizontal row. */}
      <Grid container spacing={2}>
        {showsByTheatre.map(([theatre, theatreShows]) => (
          <Grid item xs={12} sm={6} md={4} key={theatre}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {theatre}
                </Typography>
                <Stack spacing={1}>
                  {theatreShows.map((show) => (
                    <ShowtimeSlot
                      key={show.id}
                      startTime={show.startTime}
                      screenName={show.screenName}
                      format={show.format}
                      language={show.language}
                      onClick={() => navigate(`/shows/${show.id}/seats`)}
                    />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Box component={motion.div} {...viewportFadeInProps(prefersReducedMotion, fadeInUpSmall)}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <RateReviewOutlinedIcon color="primary" />
          <Typography variant="h5">Ratings & Reviews</Typography>
        </Stack>
      </Box>

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
                <MotionButton
                  type="submit"
                  variant="contained"
                  disabled={isRating}
                  sx={{ alignSelf: "flex-start" }}
                  {...ctaTapProps(prefersReducedMotion)}
                >
                  Submit rating
                </MotionButton>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}

      {reviewSummary && (
        <Card
          variant="outlined"
          sx={{
            mb: 3,
            maxWidth: 480,
            borderColor: (theme) => alpha(theme.palette.secondary.main, 0.35),
            bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.05),
          }}
        >
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Chip
                icon={<AutoAwesomeIcon fontSize="small" />}
                label="AI Summary"
                size="small"
                color="secondary"
                variant="outlined"
              />
            </Stack>
            <Stack spacing={0.75} sx={{ mb: 1 }}>
              {reviewSummary.points.map((point, i) => (
                <Typography key={i} variant="body2">
                  • {point}
                </Typography>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              AI-generated from {reviewSummary.basedOnCount} review
              {reviewSummary.basedOnCount === 1 ? "" : "s"} — may not reflect every opinion.
            </Typography>
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

      <Stack spacing={1.5}>
        {shownRatings.map((r) => {
          const isOwnReview = !!user && user.id === r.userId;
          const isRevealed = revealedSpoilers[r.id];
          return (
            <Paper key={r.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36, fontSize: "0.9rem" }}>
                  {r.userName.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600} noWrap>
                    {r.userName}
                  </Typography>
                  <Rating value={r.stars} size="small" readOnly />
                </Box>
                {r.isSpoiler && <Chip label="Spoiler" size="small" color="warning" variant="outlined" sx={{ ml: "auto" }} />}
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
            </Paper>
          );
        })}
        {ratingsData?.total === 0 && (
          <Typography color="text.secondary">No ratings yet — be the first!</Typography>
        )}
      </Stack>

      {hasMoreRatings && (
        <Button onClick={() => setRatingsPage((p) => p + 1)} sx={{ mt: 1 }}>
          Load more reviews
        </Button>
      )}

      {similarMovies && similarMovies.length > 0 && (
        <>
          <Divider sx={{ my: 3 }} />
          <Box component={motion.div} {...viewportFadeInProps(prefersReducedMotion, fadeInUpSmall)}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <RecommendOutlinedIcon color="primary" />
              <Typography variant="h5">You might also like</Typography>
            </Stack>
          </Box>
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            {similarMovies.map((similar) => (
              <Grid item xs={6} sm={3} md={2.4} lg={2} key={similar.id}>
                <MovieCard movie={similar} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
}
