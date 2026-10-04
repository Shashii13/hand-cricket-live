import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'local-client', plugins: [react()], build: { outDir: '../local-dist', emptyOutDir: true } });
