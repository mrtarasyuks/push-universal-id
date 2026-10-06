import { defineConfig } from 'vite';

// Build a fully static site into docs/ so GitHub Pages can serve it as-is.
// base './' keeps every asset path relative, which is what Pages needs for a
// project site served from /<repo>/.
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2020',
  },
  define: {
    // A few transitive deps of the SDK read process.env; shim it so the
    // browser bundle never touches a missing `process`.
    'process.env': {},
  },
});
