import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'mui': ['@mui/material', '@emotion/react', '@emotion/styled'],
          'charts': ['recharts', '@mui/x-charts'],
          'vendor': ['react', 'react-dom', 'axios'],
          'icons': ['lucide-react'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  },
  watch: {
    ignored: [
      "**/odoo-docker/**",
      "**/node_modules/**",
      "**/.git/**",
    ],
  },
});
