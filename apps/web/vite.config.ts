import { readFileSync } from 'node:fs'
import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const API_ORIGIN = process.env.TRUSTEN_API_ORIGIN ?? 'http://localhost:9200'

// Shown in the footer so anyone can tell which release is live.
const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string }
const commit = process.env.TRUSTEN_COMMIT?.trim() ?? ''
const TRUSTEN_COMMIT = /^[0-9a-f]{7,40}$/i.test(commit)
  ? commit.slice(0, 7)
  : 'dev'

export default defineConfig({
  define: {
    __TRUSTEN_VERSION__: JSON.stringify(rootPackage.version),
    __TRUSTEN_COMMIT__: JSON.stringify(TRUSTEN_COMMIT),
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
      adapter: adapter({ out: 'build' }),
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // `ws: true` matters: the live scan view upgrades to a WebSocket on this
      // same path prefix, and without it the upgrade is dropped in dev.
      // Dev and prod then use identical relative URLs.
      '/trusten/api': { target: API_ORIGIN, changeOrigin: true, ws: true },
      // Result pages load persisted screenshots and downloadable reports from
      // the same Trusten service as the JSON API.
      '/trusten/report': { target: API_ORIGIN, changeOrigin: true },
    },
  },
})
