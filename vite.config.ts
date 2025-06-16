import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: '.',
    publicDir: 'public',
    base: './',
    resolve: {
        alias: {
            '@renderer': path.resolve(__dirname, './src/renderer'),
            '@shared': path.resolve(__dirname, './src/shared'),
            '@main': path.resolve(__dirname, './src/main'),
        },
    },
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
        sourcemap: true,
        minify: 'esbuild',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
});