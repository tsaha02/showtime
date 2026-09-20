import { createTheme } from "@mui/material/styles";

// Deliberately minimal — this app's complexity budget goes to the
// booking/concurrency logic in apps/api, not admin UI polish. MUI's
// defaults do almost all of the work here.
export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#e50914" },
  },
  shape: {
    borderRadius: 6,
  },
});
