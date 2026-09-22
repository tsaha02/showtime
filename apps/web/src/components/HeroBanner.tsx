import { useRef } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import CreditScoreIcon from "@mui/icons-material/CreditScore";
import ApartmentIcon from "@mui/icons-material/Apartment";
import QrCode2Icon from "@mui/icons-material/QrCode2";

const TRUST_POINTS = [
  { icon: EventSeatIcon, label: "Live seat selection" },
  { icon: CreditScoreIcon, label: "Real Stripe payments (test mode)" },
  { icon: ApartmentIcon, label: "10 cities, 20+ theatres" },
  { icon: QrCode2Icon, label: "Instant e-tickets" },
];

const HEADLINE = "Book your next show in";

// The homepage's first impression — worth more visual investment than
// any other single element on the site, since it's the one thing every
// visitor sees. Three layered effects, each independently cheap and each
// disabled together under `prefers-reduced-motion` (checked once via
// `useReducedMotion` — a real accessibility signal, not a cosmetic
// afterthought): (1) two soft gradient "blobs" that drift slowly and
// endlessly, giving the banner a living, premium feel instead of a
// static gradient; (2) those same blobs nudge gently toward the
// cursor (desktop only — nothing here depends on it, it's a bonus on
// top of the ambient drift, and simply never fires on a touch device);
// (3) the headline reveals word-by-word on mount rather than popping in
// as one block.
export function HeroBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 60, damping: 20 });
  const springY = useSpring(pointerY, { stiffness: 60, damping: 20 });
  const blobAX = useTransform(springX, (v) => v * 18);
  const blobAY = useTransform(springY, (v) => v * 12);
  const blobBX = useTransform(springX, (v) => v * -14);
  const blobBY = useTransform(springY, (v) => v * -10);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointerX.set((e.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const words = HEADLINE.split(" ");

  return (
    <Box
      ref={containerRef}
      onMouseMove={handleMouseMove}
      sx={{
        position: "relative",
        textAlign: "center",
        py: { xs: 3, sm: 4 },
        px: 2,
        mb: { xs: 2.5, sm: 3 },
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {/* Ambient drifting gradient layer — purely decorative, sits
          behind everything (`zIndex: 0`) and never intercepts clicks
          (`pointerEvents: none`). */}
      <Box sx={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <Box
          component={motion.div}
          style={{ x: blobAX, y: blobAY }}
          animate={
            prefersReducedMotion
              ? undefined
              : { scale: [1, 1.12, 1], rotate: [0, 8, 0] }
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          sx={{
            position: "absolute",
            top: "-30%",
            left: "5%",
            width: 480,
            height: 320,
            borderRadius: "50%",
            background: (theme) =>
              `radial-gradient(ellipse, ${alpha(theme.palette.primary.main, 0.17)}, transparent 70%)`,
            filter: "blur(28px)",
          }}
        />
        <Box
          component={motion.div}
          style={{ x: blobBX, y: blobBY }}
          animate={
            prefersReducedMotion
              ? undefined
              : { scale: [1, 1.15, 1], rotate: [0, -10, 0] }
          }
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          sx={{
            position: "absolute",
            bottom: "-40%",
            right: "0%",
            width: 420,
            height: 300,
            borderRadius: "50%",
            background: (theme) =>
              `radial-gradient(ellipse, ${alpha(theme.palette.secondary.main, 0.11)}, transparent 70%)`,
            filter: "blur(28px)",
          }}
        />
      </Box>

      <Box sx={{ position: "relative", zIndex: 1 }}>
        <Typography
          variant="h3"
          component="h1"
          fontWeight={800}
          sx={{ fontSize: { xs: "1.9rem", sm: "2.6rem" }, mb: 1 }}
        >
          {words.map((word, i) => (
            <Box
              key={i}
              component={motion.span}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4, ease: "easeOut" }}
              sx={{ display: "inline-block", mr: "0.28em" }}
            >
              {word}
            </Box>
          ))}
          <Box
            component={motion.span}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: words.length * 0.06, duration: 0.4, ease: "easeOut" }}
            sx={{ display: "inline-block", color: "secondary.main" }}
          >
            seconds
          </Box>
        </Typography>
        <Typography
          component={motion.p}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" }}
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 560, mx: "auto", mb: { xs: 2, sm: 2.5 } }}
        >
          Real showtimes, live seat selection, and instant e-tickets — across 10 cities.
        </Typography>
        <Stack
          direction="row"
          spacing={{ xs: 1, sm: 1.5 }}
          justifyContent="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ rowGap: 1 }}
        >
          {TRUST_POINTS.map(({ icon: Icon, label }, i) => (
            <Box
              key={label}
              component={motion.div}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 + i * 0.06, duration: 0.35, ease: "easeOut" }}
            >
              <Chip
                icon={<Icon fontSize="small" />}
                label={label}
                size="small"
                variant="outlined"
                sx={{ bgcolor: "background.paper" }}
              />
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
