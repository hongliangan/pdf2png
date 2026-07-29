import type { NextConfig } from "next";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  // Allow HMR / asset fetches from non-localhost dev origins. Without this,
  // Next.js 16 silently blocks requests to /_next/* coming from the LAN IP
  // (e.g. when testing on a phone or another machine on the same network).
  allowedDevOrigins: ['192.168.51.84', '127.0.0.1', 'localhost'],
  // `output: 'standalone'` bundles a copyable Node project under
  // `.next/standalone/` that Electron's main process can spawn directly via
  // `node .next/standalone/server.js` (with `ELECTRON_RUN_AS_NODE=1`).
  // Without this, `next start` requires the full project layout, which
  // doesn't fit cleanly inside the asar bundle.
  output: 'standalone',
  // Lock down the project root for file tracing. Next.js / Turbopack walk
  // up the filesystem looking for a `package.json` to identify the project
  // root; on machines that happen to have a `package.json` in a parent
  // directory (e.g. a global tool manifest in $HOME), the trace root gets
  // set to that parent, which moves the entire standalone output to a
  // nested path like `.next/standalone/<parent>/<project>/server.js`. That
  // path breaks `scripts/copy-standalone-assets.mjs` (which writes to
  // `.next/standalone/...`) and `electron/main.ts` (which expects
  // `.next/standalone/server.js`).
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
