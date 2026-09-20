import { Typography, Button, Stack } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

import { useDocumentTitle } from "../hooks/useDocumentTitle";
export function NotFoundPage() {
  useDocumentTitle("Page Not Found");
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
      <Typography variant="h4">404 — Page not found</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Back to Home
      </Button>
    </Stack>
  );
}
