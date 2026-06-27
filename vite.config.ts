import { defineConfig } from 'vite';

// Cross-Origin Isolation headers are required so that SharedArrayBuffer is
// available (the worker pool accumulates the density volume atomically across
// threads). These headers are applied to both the dev server and the preview
// server. A static deployment must reproduce them (see README).
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
};

export default defineConfig({
  plugins: [crossOriginIsolation],
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
