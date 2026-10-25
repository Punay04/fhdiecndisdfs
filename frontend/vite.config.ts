import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately on :8000; in production FastAPI serves this build,
// so the app always calls a same-origin /api.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
});
