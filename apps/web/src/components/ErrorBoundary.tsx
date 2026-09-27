import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Typography, Button, Container } from "@mui/material";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// React error boundaries can only be class components — there's no
// hooks equivalent (getDerivedStateFromError/componentDidCatch have no
// hook form as of React 18). Catches a render-time crash ANYWHERE in
// the wrapped subtree and shows a friendly fallback instead of the
// blank white page a bug exactly like this once caused in production
// (the admin Shows page — see INTERVIEW_NOTES.md's section 13 — threw
// on a null `movie.title` with nothing catching it, blanking the whole
// page). That specific bug was fixed at the source, but this is the
// safety net for the NEXT one nothing anticipated.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ShowTime: caught a render error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container maxWidth="sm" sx={{ textAlign: "center", py: 10 }}>
          <Box sx={{ fontSize: 48, mb: 2 }}>🎬</Box>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Something went wrong
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            This page hit an unexpected error. Reloading usually fixes it — if it
            keeps happening, try going back to the homepage.
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
