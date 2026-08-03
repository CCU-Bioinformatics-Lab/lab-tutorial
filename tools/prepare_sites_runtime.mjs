#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'site');
const publicRoot = path.join(root, 'public');
const appRoot = path.join(root, 'app');

fs.rmSync(publicRoot, { recursive: true, force: true });
fs.cpSync(path.join(siteRoot, 'assets'), path.join(publicRoot, 'assets'), { recursive: true });

const pages = {};
for (const file of fs.readdirSync(siteRoot)) {
  if (!file.endsWith('.html')) continue;
  pages[file] = fs.readFileSync(path.join(siteRoot, file), 'utf8');
}

fs.mkdirSync(appRoot, { recursive: true });
fs.writeFileSync(
  path.join(appRoot, 'site-pages.data.mjs'),
  `export const SITE_PAGES = ${JSON.stringify(pages)};\n`,
);
