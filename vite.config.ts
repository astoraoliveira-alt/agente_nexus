import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const baseVersion = "59.0.2";
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  const shortSha = commitSha ? `-${commitSha.substring(0, 7)}` : "-local";
  const fullVersion = `v${baseVersion}${shortSha}`;

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        '/evolution-api': {
          target: 'https://evolution.davosconsulting.com.br',
          changeOrigin: true,
          secure: false, // Bypass SSL cert errors during development
          rewrite: (path) => path.replace(/^\/evolution-api/, '')
        }
        // openai-api proxy removido — embeddings gerados server-side
      }
    },
    plugins: [react()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(fullVersion),
    }
  };
});
