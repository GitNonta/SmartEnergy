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
                target: 'http://localhost:3002',
                changeOrigin: true,
                secure: false,
            },
            '/ws': {
                target: 'ws://localhost:3002',
                ws: true,
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        chunkSizeWarningLimit: 500,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // React core
                    if (id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/') ||
                        id.includes('node_modules/react-router-dom/') ||
                        id.includes('node_modules/scheduler/')) {
                        return 'vendor-react';
                    }
                    // Charting libraries (heaviest)
                    if (id.includes('node_modules/recharts/') ||
                        id.includes('node_modules/d3-') ||
                        id.includes('node_modules/victory-')) {
                        return 'vendor-recharts';
                    }
                    if (id.includes('node_modules/chart.js/') ||
                        id.includes('node_modules/react-chartjs-2/') ||
                        id.includes('node_modules/chartjs-plugin-zoom/')) {
                        return 'vendor-chartjs';
                    }
                    // Animation
                    if (id.includes('node_modules/framer-motion/')) {
                        return 'vendor-framer';
                    }
                    // MQTT client
                    if (id.includes('node_modules/mqtt/') ||
                        id.includes('node_modules/mqtt-packet/') ||
                        id.includes('node_modules/readable-stream/') ||
                        id.includes('node_modules/ws/')) {
                        return 'vendor-mqtt';
                    }
                    // UI / Radix
                    if (id.includes('node_modules/@radix-ui/') ||
                        id.includes('node_modules/react-grid-layout/') ||
                        id.includes('node_modules/lucide-react/')) {
                        return 'vendor-ui';
                    }
                    // Data / utils
                    if (id.includes('node_modules/@tanstack/') ||
                        id.includes('node_modules/axios/') ||
                        id.includes('node_modules/zod/') ||
                        id.includes('node_modules/zustand/') ||
                        id.includes('node_modules/date-fns/')) {
                        return 'vendor-data';
                    }
                    // html2canvas (export feature)
                    if (id.includes('node_modules/html2canvas/')) {
                        return 'vendor-export';
                    }
                }
            }
        }
    }
});
