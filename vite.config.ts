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
        // New SW activates immediately on all open tabs — critical for Android users
        // who never close browser tabs and would otherwise run the old app indefinitely.
        skipWaiting: true,
        clientsClaim: true,
        // Precache JS/CSS/fonts only — NOT html.
        // index.html must always be fetched from the network so users get new code
        // after every deploy without having to manually clear cache or close tabs.
        globPatterns: ['**/*.{js,css,woff2,svg,ico,png}'],
        runtimeCaching: [
          {
            // Supabase REST + Auth: NetworkFirst — always fetch live data first.
            // Cache is only used as offline fallback (financial data must never be stale).
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-v2',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Edge functions: NetworkFirst for the same reason
            urlPattern: ({ url }) => url.pathname.includes('functions/v1'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'edge-fn-v2',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
