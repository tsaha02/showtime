import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server pinned to 5174 — apps/api's CORS config allowlists exactly
// this origin as the admin frontend (see apps/api/src/config/env.ts
// `adminOrigin`).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Same reasoning as apps/web's vite.config.ts: React/MUI/Emotion
        // stay one chunk (splitting them further creates a circular
        // chunk dependency, since MUI's styled components reference
        // React internals), separate from route-level page chunks and
        // from `recharts` (used only by AnalyticsPage, and already
        // isolated into its own chunk by that page's `lazy()` import).
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom", "@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
        },
      },
    },
  },
});
