import { createTheme, alpha } from "@mui/material/styles";

// A single dark theme — a movie-booking app is almost always used in a
// "browsing at night" context, and dark backgrounds make poster art pop.
// The palette below leans into that: a warm cinematic red for primary
// actions, a marquee gold for ratings/prices/highlights, and a couple of
// deliberately-layered surface tones (default vs. paper vs. elevated card)
// instead of MUI's flat single grey, so the UI reads as designed rather
// than as an unstyled scaffold.
const primary = "#ff3d57";
const secondary = "#f5c518";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: primary, light: "#ff6b7d", dark: "#c4002e", contrastText: "#ffffff" },
    secondary: { main: secondary, dark: "#c99e0f", contrastText: "#1a1a1a" },
    background: {
      default: "#0a0a0d",
      paper: "#151519",
    },
    divider: alpha("#ffffff", 0.08),
    success: { main: "#2fd66d" },
    warning: { main: "#f5a623" },
    error: { main: "#ff5470" },
    text: {
      primary: "#f2f2f4",
      secondary: alpha("#f2f2f4", 0.64),
    },
  },
  shape: {
    borderRadius: 12,
  },
  spacing: 8,
  typography: {
    fontFamily: ["Inter", "Roboto", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Arial", "sans-serif"].join(","),
    h1: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 800, letterSpacing: -0.5 },
    h2: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 800, letterSpacing: -0.5 },
    h3: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 },
    h4: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700, letterSpacing: -0.25 },
    h5: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 },
    h6: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            "radial-gradient(ellipse 1200px 600px at 50% -10%, rgba(255,61,87,0.10), transparent), radial-gradient(ellipse 800px 500px at 100% 0%, rgba(245,197,24,0.06), transparent)",
          backgroundAttachment: "fixed",
          // BrandLogo's "cut-out" notches punch through to whatever sits
          // behind them — this app is always dark-mode, so that's always
          // the page background, never a light color.
          "--brand-notch-bg": "#0a0a0d",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, borderRadius: 10 },
        sizeLarge: { paddingTop: 10, paddingBottom: 10, fontSize: "0.95rem" },
        containedPrimary: {
          "&:hover": { boxShadow: `0 8px 20px -8px ${alpha(primary, 0.6)}` },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#15151a",
          border: `1px solid ${alpha("#ffffff", 0.06)}`,
          transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: {
          "&:hover": {
            "& .MuiCardMedia-root": { transform: "scale(1.03)" },
          },
        },
      },
    },
    MuiCardMedia: {
      styleOverrides: {
        root: { transition: "transform 260ms ease" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        rounded: { borderRadius: 14 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#0a0a0d", 0.85),
          backdropFilter: "blur(10px)",
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { fontSize: "0.75rem" },
      },
    },
  },
});
