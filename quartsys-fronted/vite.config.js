import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 15473,
    proxy: {
      "/api": {
        target: "http://localhost:18427",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 15474,
  },
});
