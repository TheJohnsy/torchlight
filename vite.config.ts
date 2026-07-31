import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      // Two pages: the game itself, and the standalone material test harness (spec §5, Owner B).
      input: {
        main: "index.html",
        harness: "harness.html",
      },
    },
  },
});
