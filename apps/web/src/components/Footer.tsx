import { Box, Container, Grid, Stack, Typography, Link as MuiLink } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";

const COMPANY_LINKS = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/offers", label: "Offers" },
  { to: "/gift-cards", label: "Gift Cards" },
];

const LEGAL_LINKS = [
  { to: "/terms", label: "Terms of Service" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/refund-policy", label: "Refund & Cancellation Policy" },
];

function FooterColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </Typography>
      {links.map((link) => (
        <MuiLink
          key={link.to}
          component={RouterLink}
          to={link.to}
          underline="hover"
          color="text.primary"
          variant="body2"
        >
          {link.label}
        </MuiLink>
      ))}
    </Stack>
  );
}

// A simple, standard site footer — sits below the routed <Container> in
// App.tsx, not inside it, so it can stretch full-bleed against the page
// background while its own inner content still respects a max width.
export function Footer() {
  return (
    <Box component="footer" sx={{ borderTop: "1px solid", borderColor: "divider", mt: 4 }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, sm: 5 } }}>
        <Grid container spacing={4}>
          <Grid item xs={12} sm={4}>
            <BrandLogo />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 280 }}>
              Real showtimes, live seat selection, and instant e-tickets.
            </Typography>
          </Grid>
          <Grid item xs={6} sm={4}>
            <FooterColumn title="Company" links={COMPANY_LINKS} />
          </Grid>
          <Grid item xs={6} sm={4}>
            <FooterColumn title="Legal" links={LEGAL_LINKS} />
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 4 }}>
          © {new Date().getFullYear()} ShowTime
        </Typography>
      </Container>
    </Box>
  );
}
