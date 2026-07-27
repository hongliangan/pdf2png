import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['__tests__/e2e/**', 'node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**', 'components/editor/**'],
      exclude: ['**/*.test.*', '**/*.spec.*', '**/types.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});