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
            // Supabase REST + Auth: NetworkOnly — financial data must NEVER be served
            // from a stale SW cache. Any caching here causes "stuck spinner" symptoms
            // because users get a 60-second-old response while the UI waits for fresh data.
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
