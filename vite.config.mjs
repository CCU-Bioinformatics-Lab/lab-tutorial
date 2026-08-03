import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const siteRoot = path.resolve('site');
const input = Object.fromEntries(
  fs.readdirSync(siteRoot)
    .filter((name) => name.endsWith('.html'))
    .map((name) => [name.replace(/\.html$/, ''), path.join(siteRoot, name)])
);

export default defineConfig({
  root: siteRoot,
  publicDir: path.join(siteRoot, 'assets'),
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input },
  },
});
