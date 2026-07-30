import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Library build — publishes EyzflowPlayer as npm package
// Declaration files are generated separately via: tsc -p tsconfig.lib.json
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "EyzflowPlayer",
      formats: ["es", "cjs"],
      fileName: (format) => `eyzflow-player.${format === "es" ? "js" : "cjs"}`,
    },
    outDir: "dist",
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
});
