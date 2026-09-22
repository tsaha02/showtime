import { memo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Card, CardActionArea, CardMedia, CardContent, Typography, Chip, Rating, Box } from "@mui/material";
import { motion } from "framer-motion";
import type { MovieDTO } from "@showtime/shared";
import { cardHoverProps, fadeInUp, usePrefersReducedMotion, viewportFadeInProps } from "../lib/motion";

const MotionCard = motion.create(Card);

// The one movie-poster-card look used across the app (Home's grid,
// MovieDetailPage's "You might also like", and Home's "Recommended for
// you") — kept as a single component so all three stay visually
// identical instead of drifting apart from copy-pasted JSX. Memoized:
// these render in grids of a dozen+ at once, and a parent re-render
// (e.g. typing in the search box, which changes unrelated state) would
// otherwise re-render every card in the grid for no reason since each
// card's own `movie` prop hasn't changed.
//
// Entrance is a `whileInView` fade-up (fires once as the grid scrolls into
// view, see `viewportFadeInProps`) rather than an on-mount animation — a
// grid of a dozen+ cards animating in the instant the page loads would be
// more distracting than the earlier zero-motion version; entering as the
// user scrolls to them reads as considered instead.
export const MovieCard = memo(function MovieCard({ movie }: { movie: MovieDTO }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <MotionCard
      {...viewportFadeInProps(prefersReducedMotion, fadeInUp)}
      {...cardHoverProps(prefersReducedMotion)}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        "&:hover": {
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
          loading="lazy"
          decoding="async"
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
        </CardContent>
      </CardActionArea>
    </MotionCard>
  );
});
