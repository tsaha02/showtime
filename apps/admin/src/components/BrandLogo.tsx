import { Box, Stack, Typography, type SxProps, type Theme } from "@mui/material";

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  sx?: SxProps<Theme>;
}

// Same mark as apps/web's BrandLogo (kept as a small duplicate rather
// than a shared import — these are two independent Vite apps with no
// cross-app source dependency, same as each having its own theme.ts).
// `--brand-notch-bg` is set to white in theme.ts, since the admin panel
// is always light-mode.
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
      <circle cx="2" cy="20" r="4" fill="var(--brand-notch-bg, #ffffff)" />
      <circle cx="38" cy="20" r="4" fill="var(--brand-notch-bg, #ffffff)" />
      <path d="M16 14.5L26 20L16 25.5V14.5Z" fill="var(--brand-notch-bg, #ffffff)" />
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
          ShowTime
        </Typography>
      )}
    </Stack>
  );
}
