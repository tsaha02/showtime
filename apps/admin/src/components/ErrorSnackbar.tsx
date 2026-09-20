import { Snackbar, Alert } from "@mui/material";

export default function ErrorSnackbar({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  return (
    <Snackbar open={!!message} autoHideDuration={5000} onClose={onClose}>
      <Alert onClose={onClose} severity="error" sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
