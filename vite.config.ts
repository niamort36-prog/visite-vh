import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base : chemin du dépôt sur GitHub Pages (https://<user>.github.io/<repo>/)
const base = process.env.VITE_BASE ?? '/visite-vh/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Visite VH — réseau HTB',
        short_name: 'Visite VH',
        description:
          "Préparation et suivi des visites héliportées des ouvrages HTB (63 kV à 400 kV)",
        theme_color: '#0b2545',
        background_color: '#0b2545',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // les jeux de données départementaux peuvent être volumineux
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/data\//],
        runtimeCaching: [
          {
            // données réseau : une fois téléchargées, elles ne changent qu'au rebuild
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'reseau-htb',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // fonds de carte IGN (Géoplateforme) — cache long pour le vol
            urlPattern: ({ url }) => url.hostname === 'data.geopf.fr',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-ign',
              expiration: { maxEntries: 30000, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tuiles-osm',
              expiration: { maxEntries: 10000, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
