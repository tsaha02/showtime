import { useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Chip,
  Container,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import BarChartIcon from "@mui/icons-material/BarChart";
import MovieIcon from "@mui/icons-material/Movie";
import ApartmentIcon from "@mui/icons-material/Apartment";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import EventIcon from "@mui/icons-material/Event";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import StarIcon from "@mui/icons-material/Star";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import FastfoodIcon from "@mui/icons-material/Fastfood";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useLogoutMutation } from "../store/adminApi";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { setUnauthenticated } from "../store/authSlice";
import { BrandLogo } from "./BrandLogo";

const navLinks = [
  { to: "/analytics", label: "Analytics", icon: <BarChartIcon fontSize="small" /> },
  { to: "/movies", label: "Movies", icon: <MovieIcon fontSize="small" /> },
  { to: "/theatres", label: "Theatres", icon: <ApartmentIcon fontSize="small" /> },
  { to: "/shows", label: "Shows", icon: <EventSeatIcon fontSize="small" /> },
  { to: "/events", label: "Events", icon: <EventIcon fontSize="small" /> },
  { to: "/event-sessions", label: "Event Sessions", icon: <ConfirmationNumberIcon fontSize="small" /> },
  { to: "/bookings", label: "Bookings", icon: <ReceiptLongIcon fontSize="small" /> },
  { to: "/ratings", label: "Ratings", icon: <StarIcon fontSize="small" /> },
  { to: "/coupons", label: "Coupons", icon: <LocalOfferIcon fontSize="small" /> },
  { to: "/food-items", label: "Food Items", icon: <FastfoodIcon fontSize="small" /> },
  { to: "/gift-cards", label: "Gift Cards", icon: <CardGiftcardIcon fontSize="small" /> },
];

const DRAWER_WIDTH = 232;

export default function AdminLayout() {
  const user = useAppSelector((s) => s.auth.user);
  const [logout] = useLogoutMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    dispatch(setUnauthenticated());
    navigate("/login");
  }

  const sidebarContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <BrandLogo />
        <Chip label="Admin" size="small" sx={{ mt: 1 }} />
      </Box>
      <Divider />
      <List sx={{ flexGrow: 1, px: 1, py: 1 }}>
        {navLinks.map((link) => (
          <ListItemButton
            key={link.to}
            component={NavLink}
            to={link.to}
            selected={location.pathname.startsWith(link.to)}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              "&.active, &.Mui-selected": {
                bgcolor: "primary.main",
                color: "primary.contrastText",
                "& .MuiListItemIcon-root": { color: "inherit" },
                "&:hover": { bgcolor: "primary.dark" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 34 }}>{link.icon}</ListItemIcon>
            <ListItemText primary={link.label} primaryTypographyProps={{ fontSize: "0.9rem", fontWeight: 600 }} />
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        {user && (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 1 }}>
            {user.email}
          </Typography>
        )}
        <Button onClick={handleLogout} variant="outlined" color="primary" size="small" fullWidth>
          Logout
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {isMobile ? (
        <>
          <AppBar position="fixed" elevation={0}>
            <Toolbar sx={{ gap: 1.5 }}>
              <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                <MenuIcon />
              </IconButton>
              <BrandLogo size={24} />
            </Toolbar>
          </AppBar>
          <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH } }}>
            {sidebarContent}
          </Drawer>
        </>
      ) : (
        <Box
          component="nav"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            position: "fixed",
            top: 0,
            bottom: 0,
            bgcolor: "background.paper",
          }}
        >
          {sidebarContent}
        </Box>
      )}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: isMobile ? 0 : `${DRAWER_WIDTH}px`,
          mt: isMobile ? "56px" : 0,
        }}
      >
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
