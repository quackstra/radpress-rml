import { defineConfig } from 'vite';

// Radpress SPA. Relative base so the static build serves from any path (GitHub Pages
// project site). Consumes @quackdown/core (pinned tarball) like any outside client.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022', emptyOutDir: true },
});
