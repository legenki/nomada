import { defineConfig } from 'vite';
import { resolve } from 'path';
import { define, outDir } from './vite.target';

// Content scripts can't be ES modules, so each is its own IIFE bundle:
//   vite build -c vite.config.content.ts --mode spoof-main
//   vite build -c vite.config.content.ts --mode spoof-bridge
// theme.js is built the same way: it runs as a classic script before the page paints.
const entries: Record<string, string> = {
  'spoof-main': 'src/content/spoof-main.ts',
  'spoof-bridge': 'src/content/spoof-bridge.ts',
  theme: 'src/lib/theme-boot.ts',
};

export default defineConfig(({ mode }) => ({
  publicDir: false,
  define,
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, entries[mode]),
      formats: ['iife'],
      name: mode.replace(/-/g, '_'),
      fileName: () => `${mode}.js`,
    },
  },
}));
