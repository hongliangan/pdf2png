This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Browser dev (no Electron)

```bash
npm run dev          # Next.js dev server on http://localhost:3000
npm test             # Vitest unit + integration
npm run coverage     # Vitest with v8 coverage (80% gate on lib/ + components/editor/)
npm run lint         # ESLint
npm run e2e          # Playwright (auto-starts dev server)
```

### Desktop dev (`dev:electron`)

```bash
npm run dev:electron   # launches Next dev + Electron shell with HMR
```

`dev:electron` runs `next dev` in the background and waits for `http://127.0.0.1:3000` to come up before spawning Electron. Edits in `app/`, `components/`, `lib/` reload via Next HMR; edits in `electron/` require a restart of the Electron process (re-run `npm run dev:electron`).

The first dev launch will likely show a SmartScreen warning — see "Windows 桌面打包" below.

## Windows 桌面打包

Goal: ship a single `.exe` that runs on a Windows 10/11 machine **without Node installed**. Recipients double-click, the app opens, file → open PDF → recolor → export.

### One-time setup (on a Windows machine, Windows runner, or Windows VM)

```bash
# 1. Install Node 20+ on the build machine.
# 2. From the repo root:
npm ci

# 3. Pin sharp for win32-x64 + Electron's Node ABI (Electron 33.4.11 ships Node 20).
#    This downloads @img/sharp-win32-x64 into node_modules and rewrites
#    package-lock.json so subsequent `npm ci` on any Windows host installs it.
npm run pin:sharp:win
```

`pin:sharp:win` is a wrapper around:

```
npm install --save-exact sharp@0.35.3 \
  --platform=win32 --arch=x64 \
  --runtime=electron --target=33.4.11
```

It also asserts that `node_modules/@img/sharp-win32-x64/package.json` exists after the install. The committed `package-lock.json` then locks the Windows prebuilt.

### Build the Windows installer + portable `.exe`

```bash
npm run build:win
```

This runs (in order):

1. `next build` → `.next/standalone/server.js` + trimmed `node_modules/`
2. `node scripts/copy-pdf-worker.mjs` → mirrors `pdf.worker.min.mjs` to `.next/standalone/public/`
3. `node scripts/copy-standalone-assets.mjs` → copies `.next/static` to `.next/standalone/.next/static` and `public/` to `.next/standalone/public/`
4. `tsc -p tsconfig.electron.json` → `dist-electron/{main,preload}.js`
5. `electron-builder --win --x64` → bundles everything into:
   - `dist/PDF2PNG Editor-0.1.0-x64.exe` (NSIS installer)
   - `dist/PDF2PNG Editor-0.1.0-portable.exe` (single-file portable)

### Run on a clean Windows 10/11 box

The user **does not need Node** — Electron's bundled runtime + sharp's Windows prebuilt are self-contained. SmartScreen will warn on first launch; click "更多信息 > 仍要运行" (More info > Run anyway). The app opens with the editor; use "File > 打开 PDF…" to load `无项目负荷度4.pdf`, recolor lines, add text boxes, then "导出 PNG/JPG" downloads the result.

If a smoke test of the export fails (no PNG, crash, blank output), the most likely cause is the sharp ABI — re-run `npm run pin:sharp:win` and rebuild.

## Deploy on Vercel

The easiest way to deploy the web app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
