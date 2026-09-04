import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendPort = env.PORT || "3000";

  return {
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      ignored: [
        "**/odoo-docker/**",
        "**/odoo19-venv/**",
        "**/node_modules/**",
        "**/.git/**",
        "**/AI_Employee_Vault/**",
        "**/vault-control/AI_Employee_Vault/**",
        "**/dist/**",
        "**/public/generated/**",
        "**/server.log",
      ],
    },
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${backendPort}`,
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
  };
});
