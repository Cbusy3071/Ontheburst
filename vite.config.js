import { defineConfig } from 'vite';

// base './' makes the build work from any folder: a custom domain,
// GitHub Pages (/Ontheburst/), Netlify or Vercel.
export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false },
  server: { port: 5173 },
});
