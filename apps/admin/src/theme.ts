import { createTheme, alpha } from "@mui/material/styles";

// A light, dashboard-appropriate theme that shares the customer app's
// brand DNA (same red/gold accents, same Manrope/Inter type pairing —
// see apps/web/src/theme.ts's comment) without copying its dark,
// cinematic mood: an admin console is a working tool used for hours at
// a stretch under office lighting, not a "browsing at night" experience,
// so it stays light-mode with calm neutral surfaces and reserves color
// for what actually needs attention (primary actions, status chips).
const primary = "#e0223f";
const secondary = "#c99e0f";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: primary, light: "#ff5470", dark: "#a3021d", contrastText: "#ffffff" },
    secondary: { main: secondary, contrastText: "#1a1a1a" },
    background: {
      default: "#f6f6f8",
      paper: "#ffffff",
    },
    divider: alpha("#1a1a1a", 0.09),
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: ["Inter", "Roboto", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Arial", "sans-serif"].join(","),
    h1: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 800 },
    h2: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 800 },
    h3: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 },
    h4: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 },
    h5: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 },
    h6: { fontFamily: "Manrope, Inter, sans-serif", fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // BrandLogo's "cut-out" notches punch through to whatever's
          // behind them — always white here, since this app never
          // switches to dark mode.
          "--brand-notch-bg": "#ffffff",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${alpha("#1a1a1a", 0.08)}`,
          boxShadow: "none",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
          color: "#1a1a1a",
          borderBottom: `1px solid ${alpha("#1a1a1a", 0.08)}`,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 700, backgroundColor: "#f6f6f8" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});
