import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, renameSync, rmSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { popup: resolve(__dirname, 'src/popup/index.html') },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: (info) => info.name === 'index.css' ? 'popup.css' : '[name].[ext]',
      },
    },
  },
  plugins: [
    {
      name: 'flatten-popup-html',
      closeBundle() {
        // Vite mirrors the source path (dist/src/popup/index.html); the manifest wants dist/popup.html.
        renameSync(resolve(__dirname, 'dist/src/popup/index.html'), resolve(__dirname, 'dist/popup.html'));
        rmSync(resolve(__dirname, 'dist/src/popup'), { recursive: true, force: true });
        copyFileSync(resolve(__dirname, 'manifest.json'), resolve(__dirname, 'dist/manifest.json'));
      },
    },
  ],
});
