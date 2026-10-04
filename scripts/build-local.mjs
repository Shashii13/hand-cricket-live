import { build } from 'vite';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
await build({ configFile: 'vite.local.config.ts' });
await writeFile('local-dist/game.css', (await readFile('app/globals.css', 'utf8')).replace('@import "tailwindcss";', ''));
await copyFile('public/favicon.svg', 'local-dist/favicon.svg');

await copyFile('public/stadium-night.png', 'local-dist/stadium-night.png');
