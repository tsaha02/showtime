import { Link as RouterLink } from "react-router-dom";
import { Card, CardActionArea, CardMedia, CardContent, Typography, Chip } from "@mui/material";
import { motion } from "framer-motion";
import type { EventDTO } from "@showtime/shared";
import { eventCategoryLabel } from "../lib/eventCategoryLabel";
import { cardHoverProps, fadeInUp, usePrefersReducedMotion, viewportFadeInProps } from "../lib/motion";

const MotionCard = motion.create(Card);

// The event-poster-card look, sibling to MovieCard — same visual style
// (poster, title, a chip below it) but without a genre/rating row, since
// Events don't carry a genre or reviews/ratings. Same hover-lift + scroll
// entrance treatment as MovieCard, so Events and Movies feel like one
// consistent grid pattern.
export function EventCard({ event }: { event: EventDTO }) {
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
      <CardActionArea component={RouterLink} to={`/events/${event.id}`} sx={{ height: "100%" }}>
        <CardMedia
          component="img"
          image={event.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
          alt={event.title}
          sx={{ aspectRatio: "2 / 3", objectFit: "cover" }}
        />
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {event.title}
          </Typography>
          <Chip label={eventCategoryLabel(event.category)} size="small" sx={{ mb: 1, mt: 0.5 }} />
        </CardContent>
      </CardActionArea>
    </MotionCard>
  );
}
