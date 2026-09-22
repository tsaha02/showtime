import { Box, Chip, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import { ctaTapProps, usePrefersReducedMotion } from "../lib/motion";

interface ShowtimeSlotProps {
  startTime: string;
  screenName: string;
  format: string;
  language: string;
  onClick: () => void;
}

// One bookable time slot — shared by MovieDetailPage's Showtimes and
// EventDetailPage's Sessions, which used to each inline their own plain
// `<Button>` whose full label was one long concatenated string ("Wed,
// Sep 23, 03:56 AM · Screen 1 · 3D · Hindi"). That reads as a wall of
// text with no hierarchy — nothing tells a scanning eye "the thing that
// actually matters here is the TIME" the way every real ticketing site's
// showtime picker does. This gives the time real visual weight (the one
// thing someone's actually choosing between), demotes date/screen to a
// caption underneath it, and pushes format/language out to small
// pill-chips instead of more inline text.
export function ShowtimeSlot({ startTime, screenName, format, language, onClick }: ShowtimeSlotProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const date = new Date(startTime);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <Box
      component={motion.button}
      type="button"
      onClick={onClick}
      {...ctaTapProps(prefersReducedMotion)}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        appearance: "none",
        font: "inherit",
        color: "inherit",
        bgcolor: "transparent",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        px: 1.5,
        py: 1,
        transition: "border-color 0.15s, background-color 0.15s",
        "&:hover": {
          borderColor: "primary.main",
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
        },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={800} lineHeight={1.2}>
          {time}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {day} · {screenName}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5} flexShrink={0}>
        <Chip label={format} size="small" variant="outlined" sx={{ height: 22, fontSize: "0.68rem" }} />
        <Chip label={language} size="small" variant="outlined" sx={{ height: 22, fontSize: "0.68rem" }} />
      </Stack>
    </Box>
  );
}
