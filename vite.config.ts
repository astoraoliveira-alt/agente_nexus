import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'recharts', 'date-fns', 'clsx', 'tailwind-merge'],
          pdf: ['pdfjs-dist'],
          mammoth: ['mammoth'],
          xlsx: ['xlsx']
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
