import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["nutshell-grimace-cobalt.ngrok-free.dev"],
    proxy: {
      "/api": {
        target: "http://localhost:5080",
        changeOrigin: true,
      },
    },
  },
});
