import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Default env is 'node'. Per-file `// @vitest-environment happy-dom`
    // comments opt component tests (.test.tsx) into the DOM env.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup-happy-dom.ts'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
