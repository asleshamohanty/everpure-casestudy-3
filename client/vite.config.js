import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server forwards /api and /ws to our Express server on port 4000,
// so the browser talks to one address and we avoid cross-origin problems.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/ws": { target: "ws://localhost:4000", ws: true },
    },
  },
});
