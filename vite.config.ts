import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'God Particle — Nifty Options Intelligence',
        short_name: 'God Particle',
        description: 'PCB analysis, Zero to Hero signals and Max Pain for Nifty 50 expiry day trading.',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Pre-cache all JS/CSS/HTML/font bundles — app shell loads instantly on revisit
        globPatterns: ['**/*.{js,css,html,woff2,svg,ico,png}'],
        runtimeCaching: [
          {
            // Supabase REST + Auth: serve stale immediately, revalidate in background
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-api-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Edge functions (Trending stocks, smooth-endpoint)
            urlPattern: ({ url }) => url.pathname.includes('functions/v1'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'edge-fn-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
