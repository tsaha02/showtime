import { AppBar, Toolbar, Typography, Button, Box, Container } from "@mui/material";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLogoutMutation } from "../store/adminApi";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setUnauthenticated } from "../store/authSlice";

const navLinks = [
  { to: "/movies", label: "Movies" },
  { to: "/theatres", label: "Theatres" },
  { to: "/shows", label: "Shows" },
  { to: "/bookings", label: "Bookings" },
  { to: "/ratings", label: "Ratings" },
];

export default function AdminLayout() {
  const user = useAppSelector((s) => s.auth.user);
  const [logout] = useLogoutMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    dispatch(setUnauthenticated());
    navigate("/login");
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>
            ShowTime Admin
          </Typography>
          {navLinks.map((link) => (
            <Button
              key={link.to}
              component={NavLink}
              to={link.to}
              color="inherit"
              sx={{
                "&.active": { textDecoration: "underline", fontWeight: 700 },
              }}
            >
              {link.label}
            </Button>
          ))}
          <Box sx={{ flexGrow: 1 }} />
          {user && (
            <Typography variant="body2" sx={{ mr: 2 }}>
              {user.email}
            </Typography>
          )}
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
