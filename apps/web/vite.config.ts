import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server is pinned to 5173 (Vite's default, set explicitly here for
// clarity) because apps/api's CORS config allowlists exactly this origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor code split off from app code so the browser can cache
        // it across deploys independently of whatever page code
        // actually changed, and so route-level lazy-loading (see
        // App.tsx) doesn't drag the whole vendor runtime along with
        // every single page chunk. React/MUI/Emotion are kept in ONE
        // chunk rather than split further — MUI's styled components
        // reference React internals, so separating them creates a
        // circular chunk dependency that Rollup has to warn about and
        // effectively undoes the split anyway. Stripe stays separate
        // since it's genuinely independent of the two.
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
          "vendor-stripe": ["@stripe/react-stripe-js", "@stripe/stripe-js"],
        },
      },
    },
  },
});
