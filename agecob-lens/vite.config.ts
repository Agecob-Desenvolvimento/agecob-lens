import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname, stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __COMMIT_SHA__: JSON.stringify(gitShortSha()),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "vendor-recharts";
          if (
            id.includes("node_modules/@radix-ui") ||
            id.includes("node_modules/lucide-react") ||
            id.includes("node_modules/react-router-dom") ||
            id.includes("node_modules/@tanstack")
          ) {
            return "vendor-ui";
          }
          if (
            id.includes("node_modules/react-markdown") ||
            id.includes("node_modules/remark-") ||
            id.includes("node_modules/micromark") ||
            id.includes("node_modules/mdast-") ||
            id.includes("node_modules/unist-") ||
            id.includes("node_modules/hast-") ||
            id.includes("node_modules/unified") ||
            id.includes("node_modules/vfile")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("node_modules")) return "vendor-core";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
