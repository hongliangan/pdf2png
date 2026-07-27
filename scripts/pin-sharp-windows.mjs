// One-time sharp ABI pin for the Windows-only packaged build.
//
// Why: Electron ships its own Node binary (version pinned by the Electron
// release). sharp's prebuilt `.node` file must match that Node ABI. The
// default `npm install sharp` on macOS/Linux only pulls the platform's
// prebuilt; on Windows we need the win32-x64 + Electron + Node-version-33
// triple so the packaged exe can `require('sharp')` without any
// post-install step on the target machine.
//
// Run this from a Windows shell (PowerShell or git-bash) after `npm ci`:
//
//   node scripts/pin-sharp-windows.mjs
//
// It will rewrite `package-lock.json` to lock sharp@<ver> for the
// win32-x64 + electron + Node 33 (matching Electron 33.4.11's libnode)
// target, then verify the platform package is present locally.
//
// Safe to re-run; it's idempotent.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
process.chdir(projectRoot);

const SHARP_VERSION = '0.35.3';
const ELECTRON_VERSION = '33.4.11';

function run(cmd) {
  console.log(`[pin-sharp] ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot });
}

if (process.platform !== 'win32') {
  console.log(
    `[pin-sharp] host is ${process.platform}; this script is meant to be run on Windows.`,
  );
  console.log(
    '[pin-sharp] skipping the actual install but the command you would run is:',
  );
  console.log(
    `  npm install --save-exact sharp@${SHARP_VERSION} ` +
      `--platform=win32 --arch=x64 ` +
      `--runtime=electron --target=${ELECTRON_VERSION}`,
  );
  process.exit(0);
}

run(
  `npm install --save-exact sharp@${SHARP_VERSION} ` +
    `--platform=win32 --arch=x64 ` +
    `--runtime=electron --target=${ELECTRON_VERSION}`,
);

const winPackage = resolve(
  projectRoot,
  'node_modules/@img/sharp-win32-x64/package.json',
);
if (!existsSync(winPackage)) {
  console.error(
    `[pin-sharp] expected ${winPackage} to exist after pin; check npm output above.`,
  );
  process.exit(1);
}
console.log(`[pin-sharp] ok — sharp is pinned for win32-x64 + Electron ${ELECTRON_VERSION}.`);
console.log(
  '[pin-sharp] next step: npm run build:win → produces dist/PDF2PNG Editor Setup 0.1.0.exe',
);
