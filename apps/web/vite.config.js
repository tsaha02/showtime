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
});
