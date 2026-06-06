import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: './electron/main.js',
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: './electron/preload.js',
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    // index.html lives at project root — same layout as the browser Vite build
    root: '.',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: 'index.html',
      },
    },
  },
});
