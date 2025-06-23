import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: '.',
    publicDir: 'public',
    base: './', // Important: use relative paths for Electron
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
        sourcemap: process.env.NODE_ENV === 'development',
        minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            },
            output: {
                // Ensure assets are loaded with relative paths
                assetFileNames: 'assets/[name]-[hash][extname]',
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js',
            },
        },
        target: 'esnext',
    },
    server: {
        // This is only used during development with vite dev server
        // In production, Electron loads files directly
        port: 5173,
        strictPort: true,
        // Disable HMR for Electron compatibility
        hmr: false,
    },
    // Important: Don't externalize Node.js modules
    // They should be handled by Electron's node integration
    optimizeDeps: {
        exclude: ['electron'],
    },
    esbuild: {
        target: 'esnext',
    },
});