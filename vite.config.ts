import { defineConfig } from 'vitest/config';
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022' },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
