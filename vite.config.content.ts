import { defineConfig } from 'vite';
import { resolve } from 'path';
import { define, outDir } from './vite.target';

// Content scripts can't be ES modules, so each is its own IIFE bundle:
//   vite build -c vite.config.content.ts --mode spoof-main
//   vite build -c vite.config.content.ts --mode spoof-bridge
export default defineConfig(({ mode }) => ({
  publicDir: false,
  define,
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, `src/content/${mode}.ts`),
      formats: ['iife'],
      name: mode.replace(/-/g, '_'),
      fileName: () => `${mode}.js`,
    },
  },
}));
