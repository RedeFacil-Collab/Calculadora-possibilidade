import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/static/react/',
  build: {
    outDir: '../static/react',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        login: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
