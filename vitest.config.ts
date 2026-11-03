import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@/plugins/sdk': fileURLToPath(
        new URL('./test/support/cosmos-pay-sdk.ts', import.meta.url),
      ),
    },
  },
  test: {
    coverage: { reporter: ['text', 'html'] },
    include: ['test/unit/**/*.test.ts'],
  },
});
