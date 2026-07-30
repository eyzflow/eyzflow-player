import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SPA build — used for iframe embed hosting
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-app",
  },
});
