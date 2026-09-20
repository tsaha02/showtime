import { Link as RouterLink } from "react-router-dom";
import { Card, CardActionArea, CardMedia, CardContent, Typography, Chip, Rating, Box } from "@mui/material";
import type { MovieDTO } from "@showtime/shared";

// The one movie-poster-card look used across the app (Home's grid,
// MovieDetailPage's "You might also like", and Home's "Recommended for
// you") — kept as a single component so all three stay visually
// identical instead of drifting apart from copy-pasted JSX.
export function MovieCard({ movie }: { movie: MovieDTO }) {
  return (
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
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
