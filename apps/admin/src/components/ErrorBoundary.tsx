import { Component, type ErrorInfo, type ReactNode } from "react";
import { Typography, Button, Container } from "@mui/material";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// See the identical component (and its full reasoning) in apps/web —
// this is the admin panel's copy of the same safety net. Concretely
// motivated by a real bug this app hit: the Shows page once crashed
// blank white on a null `movie.title` with nothing catching it (see
// INTERVIEW_NOTES.md's section 13) — fixed at the source, but this
// boundary is what stops the NEXT unanticipated crash from doing the
// same thing to an admin mid-task.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ShowTime admin: caught a render error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container maxWidth="sm" sx={{ textAlign: "center", py: 10 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Something went wrong
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            This page hit an unexpected error. Reloading usually fixes it.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </Container>
      );
    }
    return this.props.children;
  }
}
