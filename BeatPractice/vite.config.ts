import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev-server port.
// Styles: Tailwind 3 (via postcss.config.js) is used on purpose: it produces plain CSS that
// also works in the older Safari/WebKit that ships with older macOS versions.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "safari13", cssTarget: "safari13" },
});
