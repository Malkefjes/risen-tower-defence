import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:single` inlines everything into one index.html,
// which is what gets published as a playable link.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [viteSingleFile()] : [],
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
}));
