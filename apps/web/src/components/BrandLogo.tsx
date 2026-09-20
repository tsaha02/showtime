import { Box, Stack, Typography, type SxProps, type Theme } from "@mui/material";

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  sx?: SxProps<Theme>;
}

// The app's one shared logo mark — a ticket stub with a play notch,
// used everywhere "ShowTime" needs a visual identity (nav bars,
// favicons, the admin panel, PDF tickets) instead of a stock MUI icon.
// Kept as a single inline SVG (not an image asset) so it always
// inherits `currentColor` and stays crisp at any size.
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      sx={{ flexShrink: 0, display: "block" }}
      aria-hidden
    >
      <rect x="2" y="6" width="36" height="28" rx="7" fill="currentColor" />
      <circle cx="2" cy="20" r="4" fill="var(--brand-notch-bg, #0a0a0d)" />
      <circle cx="38" cy="20" r="4" fill="var(--brand-notch-bg, #0a0a0d)" />
      <path d="M16 14.5L26 20L16 25.5V14.5Z" fill="var(--brand-notch-bg, #0a0a0d)" />
    </Box>
  );
}

export function BrandLogo({ size = 28, showWordmark = true, sx }: BrandLogoProps) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={sx}>
      <Box sx={{ color: "primary.main" }}>
        <BrandMark size={size} />
      </Box>
      {showWordmark && (
        <Typography variant="h6" component="span" sx={{ fontFamily: "Manrope, Inter, sans-serif", fontWeight: 800 }}>
          Show<Box component="span" sx={{ color: "secondary.main" }}>Time</Box>
        </Typography>
      )}
    </Stack>
  );
}
