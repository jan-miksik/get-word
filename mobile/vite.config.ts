import { defineConfig } from 'vite';

export default defineConfig({
  // Reuse the repository-level .env.local. Vite only exposes the explicitly
  // public VITE_ and NEXT_PUBLIC_ prefixes to the bundled mobile client.
  envDir: '..',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
});
