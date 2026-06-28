import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // vitest 4.x uses Vite 6 internally; Vite 6 uses oxc (not esbuild) for transforms.
  // We must configure oxc to use the automatic JSX runtime so vitest can parse .tsx
  // files even though the project tsconfig sets jsx:"preserve" (for Vite 5 / the app bundle).
  // @ts-ignore — oxc is a Vite 6 option, not yet reflected in all type stubs
  oxc: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/src/__tests__/setup.ts"],
    include: ["client/src/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".cache"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      // Allows server-side integration tests (living in client/src/__tests__/) to
      // import server modules without ../../../../ relative paths.
      "@server": path.resolve(import.meta.dirname, "server"),
    },
  },
});
