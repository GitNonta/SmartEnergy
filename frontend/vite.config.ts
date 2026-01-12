import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    server: {
        host: true,
        port: 3000,
        open: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false,
            },
            '/ws': {
                target: 'ws://localhost:3001',
                ws: true,
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: true
    }
});
