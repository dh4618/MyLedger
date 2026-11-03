/**
 * Builds the app as ONE self-contained HTML fragment (CSS and JS inlined) for a private
 * preview page published from Claude. Output: dist-preview/racecard-research.html
 *
 * The preview host wraps the file in its own <html>/<head>/<body>, so only the content goes in.
 */
import { build } from 'vite';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outDir = 'dist-preview';
await rm(outDir, { recursive: true, force: true });
await build({ mode: 'preview', base: './', logLevel: 'warn', build: { outDir, emptyOutDir: true } });

const assets = join(outDir, 'assets');
const files = await readdir(assets);
const read = (ext) => Promise.all(files.filter((f) => f.endsWith(ext)).map((f) => readFile(join(assets, f), 'utf8')));
const css = (await read('.css')).join('\n');
const js = (await read('.js')).join('\n').replace(/<\/script/gi, '<\\/script');

const html = `<title>Racecard Research</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="robots" content="noindex">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'racecard-research.html'), html);
await rm(assets, { recursive: true, force: true });
await rm(join(outDir, 'index.html'), { force: true });
console.log(`Wrote ${outDir}/racecard-research.html (${(html.length / 1024).toFixed(0)} KB)`);
