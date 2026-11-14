import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    // Build output goes to root so GitHub Pages can serve it
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                kami: resolve(__dirname, 'kami.html'),
            },
        },
    },
    // Base path for GitHub Pages (root of the repo)
    base: '/',
});
