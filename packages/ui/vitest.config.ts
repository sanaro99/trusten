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
    // Everything else under src/ uses bun:test and runs under `bun test`.
    // Vitest only owns Svelte component tests, named *.svelte.test.ts so the
    // two runners never fight over the same file regardless of which
    // directory a test lives in.
    include: ['src/**/*.svelte.test.ts'],
  },
})
