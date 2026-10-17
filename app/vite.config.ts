import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  // LanceDB loads a native .node binary that Vite cannot bundle.
  optimizeDeps: { exclude: ["@lancedb/lancedb"] },
  ssr: {
    external: ["@lancedb/lancedb"],
    optimizeDeps: { exclude: ["@lancedb/lancedb"] },
  },
});
