import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BASE_SECURITY_HEADERS, BUILD_SECURITY_HEADERS } from './security-headers.js';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: BASE_SECURITY_HEADERS },
  preview: { headers: BUILD_SECURITY_HEADERS },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router'], zod: ['zod'] },
      },
    },
  },
});
