import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "/storybook/",
  plugins: [preact()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1200,
  },
});
