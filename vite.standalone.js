import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Standalone build config.
 * Produces a single self-contained HTML file in dist-standalone/
 * with all JS, CSS, and assets inlined — no server required.
 *
 * Run with: npm run build:standalone
 * Output:   dist-standalone/index.html  (double-click to open)
 */
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
  ],
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    // Inline everything — no separate chunk files
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Single JS bundle, no code splitting
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});

