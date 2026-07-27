// Copies the runtime assets that Next.js's `output: 'standalone'` does NOT
// copy automatically into `.next/standalone/`. Without this step:
//   - `_next/static/*` (hashed JS/CSS chunks) → browser 404s on first paint
//   - `public/*` (besides the pdf.worker which `copy-pdf-worker.mjs` mirrors)
//     → any other static asset is missing in the packaged app
//
// Safe to run repeatedly: it uses `fs.cpSync({ recursive: true })` which
// overwrites in place. Designed to be invoked from `build:next:stage` (after
// `next build`) and from `postinstall` (no-op when `.next` doesn't exist yet).

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const standaloneDir = resolve(projectRoot, '.next/standalone');
const standaloneStatic = resolve(standaloneDir, '.next/static');
const standalonePublic = resolve(standaloneDir, 'public');

function copyIfExists(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[stage-assets] skip ${label} (${src} missing)`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`[stage-assets] copied ${label} → ${dest}`);
}

// 1) Hashed client assets: `.next/static` → `.next/standalone/.next/static`.
//    Next's standalone build references these as `/_next/static/...` from the
//    rendered HTML, so they must live at the relative path the server expects.
copyIfExists(
  resolve(projectRoot, '.next/static'),
  standaloneStatic,
  '.next/static',
);

// 2) Public folder (covers pdf.worker, sample assets, anything else).
//    The pdf.worker was already mirrored by `copy-pdf-worker.mjs`; this
//    overwrites it with the full public tree, which is fine because the
//    worker file is identical.
copyIfExists(
  resolve(projectRoot, 'public'),
  standalonePublic,
  'public',
);
