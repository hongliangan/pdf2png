import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The React 19 "set-state-in-effect" rule flags our two legitimate uses:
  // (a) measuring layout (SVG bounding rect) into state, and
  // (b) syncing a local edit-draft to props when a textbox is selected.
  // Both are standard patterns; the rule's recommendations don't apply.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party / generated assets that should never be linted:
    "public/pdf.worker.min.mjs",
    "__tests__/fixtures/**",
    "scripts/**",
    // Compiled Electron main/preload output. The TS source is linted
    // separately; the JS is produced by `tsc -p tsconfig.electron.json`.
    "dist-electron/**",
  ]),
]);

export default eslintConfig;
