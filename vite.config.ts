import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-64-v3.png', 'apple-touch-icon-v3.png'],
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
          { src: 'icon-192-v3.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512-v3.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-v3.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,json}'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
    }),
  ],
})
