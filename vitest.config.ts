import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    env: { CALENDAR_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/lib/calendar/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
