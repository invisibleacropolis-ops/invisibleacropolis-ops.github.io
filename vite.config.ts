import { defineConfig } from 'vite';

export default defineConfig({
    // Build output goes to root so GitHub Pages can serve it
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    // Base path for GitHub Pages (root of the repo)
    base: '/',
});
