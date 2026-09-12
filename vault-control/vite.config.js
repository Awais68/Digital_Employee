import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dedicated dev ports. Vite's default 5173 is shared with every other Vite
// project on this machine, so `npm run dev` used to silently slide to 5174/5175
// and the dashboard was nowhere near the URL you had bookmarked. strictPort
// makes a clash fail loudly instead of moving the goalposts.
const DEV_PORT = 5273;
const DEV_API_PORT = "3100";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendPort = env.VITE_DEV_API_PORT || DEV_API_PORT;

  return {
  plugins: [react()],
  server: {
    port: Number(env.VITE_DEV_PORT || DEV_PORT),
    strictPort: true,
    watch: {
      // Anything here that is missed gets an inotify watch, and this host runs
      // out of them — at which point Vite does not degrade, it throws ENOSPC on
      // startup and exits. whatsapp_session alone is a 1000-file Chrome profile.
      ignored: [
        "**/odoo-docker/**",
        "**/odoo19-venv/**",
        "**/node_modules/**",
        "**/.git/**",
        "**/AI_Employee_Vault/**",
        "**/vault-control/AI_Employee_Vault/**",
        "**/dist/**",
        "**/public/generated/**",
        "**/public/uploads/**",
        "**/whatsapp_session/**",
        "**/linkedin_session/**",
        "**/facebook_session/**",
        "**/instagram_session/**",
        "**/.wwebjs_cache/**",
        "**/.wwebjs_auth/**",
        "**/Logs/**",
        "**/test_output/**",
        "**/*.log",
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
