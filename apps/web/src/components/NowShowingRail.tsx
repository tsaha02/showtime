import { Link as RouterLink } from "react-router-dom";
import { Box, Card, CardActionArea, CardMedia, CardContent, Typography, Skeleton } from "@mui/material";
import { useGetMoviesQuery } from "../store/api";

const RAIL_SIZE = 8;

// A decorative, secondary strip of bookable movies shown alongside the auth
// forms (login/register/forgot/reset/verify) so those pages don't feel like
// an empty form dropped in blank space. Deliberately simpler than the
// HomePage grid cards — poster + title only, no rating/genre/duration.
// On mobile it's a horizontal-scroll row below the form; on desktop it fills
// the second column as a small grid.
export function NowShowingRail() {
  const { data: movies, isLoading } = useGetMoviesQuery({ bookable: true });
  const list = (movies ?? []).slice(0, RAIL_SIZE);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Now Showing
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        While you're here, take a look at what's playing.
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridAutoFlow: { xs: "column", md: "row" },
          gridTemplateColumns: { xs: "none", md: "repeat(3, 1fr)" },
          gridAutoColumns: { xs: "38%", sm: "28%" },
          gap: { xs: 1.5, md: 2 },
          overflowX: { xs: "auto", md: "visible" },
          pb: 1,
        }}
      >
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" sx={{ aspectRatio: "2 / 3", borderRadius: 2 }} />
          ))}
        {list.map((movie) => (
          <Card key={movie.id} sx={{ flexShrink: 0 }}>
            <CardActionArea component={RouterLink} to={`/movies/${movie.id}`}>
              <CardMedia
                component="img"
                image={movie.posterUrl ?? "https://placehold.co/300x450?text=No+Poster"}
                alt={movie.title}
                sx={{ aspectRatio: "2 / 3", objectFit: "cover" }}
              />
              <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {movie.title}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
        {!isLoading && list.length === 0 && (
          <Typography color="text.secondary" variant="body2">
            Nothing bookable right now — check back soon.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
