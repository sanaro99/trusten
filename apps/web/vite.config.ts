import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const API_ORIGIN = process.env.TRUSTEN_API_ORIGIN ?? 'http://localhost:9200'

export default defineConfig({
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
    },
  },
})
