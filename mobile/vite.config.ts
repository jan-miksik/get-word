import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const shim = (name: string) =>
  fileURLToPath(new URL(`./src/next-shims/${name}`, import.meta.url));

export default defineConfig(({ mode }) => {
  // Shared components read Next's build-time `process.env`, which does not
  // exist in a Vite bundle. Substituting the whole object keeps every
  // `process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_*` read working without
  // touching the shared sources.
  const env = loadEnv(mode, repoRoot, ['NEXT_PUBLIC_']);
  const processEnv = {
    NODE_ENV: mode === 'production' ? 'production' : 'development',
    NEXT_PUBLIC_NATIVE_APP: '1',
    ...env,
  };

  return {
    // Reuse the repository-level .env.local. Vite only exposes the explicitly
    // public VITE_ and NEXT_PUBLIC_ prefixes to the bundled mobile client.
    envDir: '..',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env': JSON.stringify(processEnv),
    },
    resolve: {
      alias: [
        // The shared UI is written against Next's client-side modules. The native
        // bundle has no Next runtime, so each one is swapped for a small local
        // equivalent — that keeps every shared source file unchanged and unaware
        // of which app is rendering it.
        { find: /^next\/link$/, replacement: shim('link.tsx') },
        { find: /^next\/image$/, replacement: shim('image.tsx') },
        { find: /^next\/navigation$/, replacement: shim('navigation.tsx') },
        { find: /^next\/dynamic$/, replacement: shim('dynamic.tsx') },
        { find: /^next\/font\/local$/, replacement: shim('font-local.ts') },
        { find: /^@\//, replacement: repoRoot },
      ],
      // The mobile package and the repository root both depend on React; two
      // copies in one bundle break hooks.
      dedupe: ['react', 'react-dom'],
    },
    css: {
      // Tailwind v4 is configured by the repository-level PostCSS config.
      postcss: repoRoot,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        onwarn(warning, warn) {
          // Shared components carry Next's "use client" directive. It is
          // meaningless in a single-bundle build and would otherwise drown the
          // output in one warning per file.
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 4174,
      fs: {
        // The bundle imports source and assets from outside `mobile/`.
        allow: [repoRoot],
      },
    },
  };
});
