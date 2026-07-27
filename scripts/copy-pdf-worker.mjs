// Copies pdfjs-dist's worker into /public so the browser can fetch it.
// Runs automatically after `npm install` via the package.json postinstall hook.
//
// Also mirrors the worker into `.next/standalone/public/` so the Electron
// packaged build always has it (Next's standalone output occasionally
// prunes public/ depending on which routes are reached). Cheap insurance.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// pdfjs-dist 4.x ships ESM worker at this path
const candidates = [
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
];

const dest = resolve(projectRoot, 'public/pdf.worker.min.mjs');

for (const rel of candidates) {
  const src = resolve(projectRoot, rel);
  if (existsSync(src)) {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    console.log(`[postinstall] copied pdf.worker.min.mjs → public/`);
    // Mirror into the standalone build dir if it exists. Standalone is
    // only created by `next build`, so during `npm install` this is a
    // no-op; during CI / dev builds we re-run this script after `build:next`
    // to keep them in sync. We always create the dir so the next build
    // doesn't drop the worker.
    const standaloneDest = resolve(
      projectRoot,
      '.next/standalone/public/pdf.worker.min.mjs',
    );
    await mkdir(dirname(standaloneDest), { recursive: true });
    let needsMirror = true;
    try {
      const s = await stat(standaloneDest);
      if (s.size > 0) needsMirror = false;
    } catch {
      // Doesn't exist yet — mirror.
    }
    if (needsMirror) {
      await copyFile(src, standaloneDest);
      console.log(
        `[postinstall] mirrored pdf.worker.min.mjs → .next/standalone/public/`,
      );
    }
    process.exit(0);
  }
}

console.warn(
  '[postinstall] pdfjs-dist worker not found; skipping copy. Run `npm install pdfjs-dist` then re-run.',
);
process.exit(0);