import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  // two pages from one build: the app (index.html) and the owner's VIS-Officium (officium.html)
  build: {
    rollupOptions: {
      input: { main: 'index.html', officium: 'officium.html' },
    },
  },
  define: {
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-64-v4.png', 'apple-touch-icon-v4.png'],
      manifest: {
        name: 'VIS',
        short_name: 'VIS',
        description: 'Training, Fortschritt, Körper.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icon-192-v4.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512-v4.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-v4.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,json}'],
        // the Officium always comes fresh from the network, never from the app's offline cache
        globIgnores: ['push-sw.js', 'officium.html', 'officium*', 'assets/officium-*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        importScripts: ['push-sw.js'],
        // the Officium is its own page, never the app's fallback
        navigateFallbackDenylist: [/officium/],
      },
    }),
    // the PWA plugin adds the app's manifest to every page; the Officium keeps only its own
    {
      name: 'officium-own-manifest',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) => (ctx.filename.endsWith('officium.html') ? html.replace(/<link rel="manifest" href="\.\/manifest\.webmanifest"\s*\/?>/, '') : html),
      },
    },
  ],
})
