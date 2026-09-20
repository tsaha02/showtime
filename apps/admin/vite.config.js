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
});
