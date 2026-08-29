import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte()],
  // Without this, Vite resolves Svelte's server-side build even under the
  // jsdom test environment, and every render() throws
  // "mount(...) is not available on the server".
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    globals: true,
    // content/**/*.test.ts uses bun:test and runs under `bun test`; Vitest
    // only owns the Svelte component tests, which live beside their .svelte
    // files outside src/content.
    include: ['src/**/*.test.ts'],
    exclude: ['src/content/**', 'node_modules/**'],
  },
})
