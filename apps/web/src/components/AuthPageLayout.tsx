import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Grid, Stack, Typography } from "@mui/material";
import LocalMoviesIcon from "@mui/icons-material/LocalMovies";
import { NowShowingRail } from "./NowShowingRail";

// Shared composition for the auth pages (login/register/forgot/reset/verify).
// They used to be a lone centered Card floating in empty space; this wraps
// each page's unchanged form card in a two-column layout with a brand mark
// above the form and a "Now Showing" movie rail alongside it, so the page
// still feels like ShowTime instead of a generic auth form. On mobile the
// columns stack — form first, movies below — since that's just Grid item
// document order collapsing to xs={12}.
export function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ py: { xs: 2, md: 3 } }}>
      <Grid container spacing={{ xs: 5, md: 6 }} alignItems="center">
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              component={RouterLink}
              to="/"
              sx={{ textDecoration: "none", color: "inherit", display: { xs: "none", md: "flex" } }}
            >
              <LocalMoviesIcon color="primary" fontSize="large" />
              <Typography variant="h5" fontWeight={800} component="span">
                ShowTime
              </Typography>
            </Stack>
            {children}
          </Stack>
        </Grid>
        <Grid item xs={12} md={7}>
          <NowShowingRail />
        </Grid>
      </Grid>
    </Box>
  );
}
