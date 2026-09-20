import { useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Stack,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { Link as RouterLink, useNavigate, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { useLogoutMutation } from "../store/api";
import { clearUser } from "../store/slices/authSlice";
import { showToast } from "../store/slices/uiSlice";
import { BrandLogo } from "./BrandLogo";

const NAV_LINKS = [
  { to: "/search-movies", label: "Search Movies" },
  { to: "/events", label: "Events" },
  { to: "/offers", label: "Offers" },
  { to: "/gift-cards", label: "Gift Cards" },
  { to: "/checkout/find-booking", label: "Find Booking" },
];

export function NavBar() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [logout] = useLogoutMutation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    dispatch(clearUser());
    dispatch(showToast({ message: "Logged out", severity: "info" }));
    setDrawerOpen(false);
    navigate("/");
  };

  const closeDrawer = () => setDrawerOpen(false);

  const brand = (
    <Box component={RouterLink} to="/" sx={{ textDecoration: "none", color: "inherit", display: "inline-flex" }}>
      <BrandLogo />
    </Box>
  );

  return (
    <>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar sx={{ gap: { xs: 1, md: 2 } }}>
          {isMobile && (
            <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
          )}
          {brand}
          <Box sx={{ flexGrow: 1 }} />

          {!isMobile && (
            <>
              {NAV_LINKS.map((link) => (
                <Button key={link.to} component={RouterLink} to={link.to} color="inherit">
                  {link.label}
                </Button>
              ))}
              {user ? (
                <>
                  <Button component={RouterLink} to="/my-bookings" color="inherit">
                    My Bookings
                  </Button>
                  <Button component={RouterLink} to="/profile" color="inherit">
                    Profile
                  </Button>
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>
                    {user.name}
                  </Typography>
                  {!user.emailVerified && (
                    <Chip
                      label="Verify your email"
                      size="small"
                      color="warning"
                      component={RouterLink}
                      to="/verify-email"
                      clickable
                    />
                  )}
                  <Button onClick={handleLogout} variant="outlined" color="primary">
                    Logout
                  </Button>
                </>
              ) : (
                <>
                  <Button component={RouterLink} to="/login" color="inherit">
                    Login
                  </Button>
                  <Button component={RouterLink} to="/register" variant="contained" color="primary">
                    Sign Up
                  </Button>
                </>
              )}
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={isMobile && drawerOpen} onClose={closeDrawer}>
        <Box sx={{ width: 260 }} role="presentation">
          <Box sx={{ p: 2 }}>{brand}</Box>
          <Divider />
          <List>
            {NAV_LINKS.map((link) => (
              <ListItemButton key={link.to} component={RouterLink} to={link.to} onClick={closeDrawer} selected={location.pathname === link.to}>
                <ListItemText primary={link.label} />
              </ListItemButton>
            ))}
            {user && (
              <ListItemButton component={RouterLink} to="/my-bookings" onClick={closeDrawer} selected={location.pathname === "/my-bookings"}>
                <ListItemText primary="My Bookings" />
              </ListItemButton>
            )}
            {user && (
              <ListItemButton component={RouterLink} to="/profile" onClick={closeDrawer} selected={location.pathname === "/profile"}>
                <ListItemText primary="Profile" />
              </ListItemButton>
            )}
          </List>
          <Divider />
          <Box sx={{ p: 2 }}>
            {user ? (
              <Stack spacing={1.5} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">
                  Signed in as {user.name}
                </Typography>
                {!user.emailVerified && (
                  <Chip label="Verify your email" size="small" color="warning" component={RouterLink} to="/verify-email" clickable onClick={closeDrawer} />
                )}
                <Button onClick={handleLogout} variant="outlined" color="primary" fullWidth>
                  Logout
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Button component={RouterLink} to="/login" variant="outlined" onClick={closeDrawer} fullWidth>
                  Login
                </Button>
                <Button component={RouterLink} to="/register" variant="contained" color="primary" onClick={closeDrawer} fullWidth>
                  Sign Up
                </Button>
              </Stack>
            )}
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
