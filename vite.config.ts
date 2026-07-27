import { defineConfig } from 'vite'

/**
 * In development the game runs on Vite's server and the board lives on the
 * Node server, so `/api` is proxied across. In production one Node process
 * serves both and this config isn't involved.
 */
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.TANGENT_PORT ?? 8787}`,
        changeOrigin: false,
      },
    },
  },
})
