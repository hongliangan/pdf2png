import type { NextConfig } from "next";

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
};

export default nextConfig;
